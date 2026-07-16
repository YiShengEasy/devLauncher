use md4::{Digest, Md4};
use rand::{distributions::Uniform, seq::SliceRandom, Rng};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;
use tempfile::TempDir;
use zeroize::Zeroizing;

use crate::builtins::remotedesk::RemoteDeskProfile;

const CLIENT_EXECUTABLES: &[&str] = &[
    "mstsc.exe",
    "mstsc",
    "sdl-freerdp",
    "xfreerdp3",
    "xfreerdp",
    "wfreerdp.exe",
    "wfreerdp",
];
const HOST_EXECUTABLES: &[&str] = &[
    "freerdp-shadow-cli",
    "grdctl",
    "systemctl",
    "winpr-makecert",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HostOs {
    Windows,
    Linux,
    Macos,
    Other,
}

impl HostOs {
    fn current() -> Self {
        if cfg!(target_os = "windows") {
            Self::Windows
        } else if cfg!(target_os = "linux") {
            Self::Linux
        } else if cfg!(target_os = "macos") {
            Self::Macos
        } else {
            Self::Other
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::Linux => "linux",
            Self::Macos => "macos",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DesktopSession {
    WindowsConsole,
    X11,
    GnomeWayland,
    OtherWayland,
    MacosConsole,
    Unknown,
}

impl DesktopSession {
    fn current(os: HostOs) -> Self {
        match os {
            HostOs::Windows => Self::WindowsConsole,
            HostOs::Macos => Self::MacosConsole,
            HostOs::Linux => {
                let session_type = env::var("XDG_SESSION_TYPE")
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                let desktop = env::var("XDG_CURRENT_DESKTOP")
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if session_type == "wayland" {
                    if desktop.contains("gnome") {
                        Self::GnomeWayland
                    } else {
                        Self::OtherWayland
                    }
                } else if session_type == "x11" || env::var_os("DISPLAY").is_some() {
                    Self::X11
                } else {
                    Self::Unknown
                }
            }
            HostOs::Other => Self::Unknown,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::WindowsConsole => "windows_console",
            Self::X11 => "x11",
            Self::GnomeWayland => "gnome_wayland",
            Self::OtherWayland => "other_wayland",
            Self::MacosConsole => "macos_console",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RdpClientKind {
    #[default]
    Auto,
    System,
    FreeRdp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RdpHostBackend {
    FreeRdpShadow,
    GnomeRemoteDesktop,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpCapabilities {
    pub platform: String,
    pub desktop_session: String,
    pub clients: Vec<RdpClientKind>,
    pub host_backends: Vec<RdpHostBackend>,
    pub recommended_client: Option<RdpClientKind>,
    pub recommended_host: Option<RdpHostBackend>,
    pub host_error_code: Option<String>,
    pub executables: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpLaunchResult {
    pub client: RdpClientKind,
    pub executable: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CommandSpec {
    executable: String,
    args: Vec<String>,
}

struct RdpHostRuntime {
    backend: RdpHostBackend,
    address: String,
    port: u16,
    _username: String,
    _password: Zeroizing<String>,
    child: Option<Child>,
    _session_dir: TempDir,
    stderr_tail: Arc<Mutex<String>>,
    gnome_managed: bool,
}

pub(crate) struct RdpHostState {
    runtime: Mutex<Option<RdpHostRuntime>>,
    last_error: Mutex<Option<(String, String)>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpHostInfo {
    pub backend: RdpHostBackend,
    pub desktop_session: String,
    pub address: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub tls: bool,
    pub nla: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpHostStatus {
    pub running: bool,
    pub backend: Option<RdpHostBackend>,
    pub desktop_session: String,
    pub address: Option<String>,
    pub port: Option<u16>,
    pub tls: bool,
    pub nla: bool,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

pub fn setup(app: &mut tauri::App) {
    app.manage(RdpHostState {
        runtime: Mutex::new(None),
        last_error: Mutex::new(None),
    });
}

#[derive(Debug, Clone)]
struct DetectionInput {
    os: HostOs,
    session: DesktopSession,
    executables: BTreeSet<String>,
}

fn contains_any(executables: &BTreeSet<String>, names: &[&str]) -> bool {
    names.iter().any(|name| executables.contains(*name))
}

fn detect_capabilities(input: &DetectionInput) -> RdpCapabilities {
    let has_system_client =
        input.os == HostOs::Windows && contains_any(&input.executables, &["mstsc.exe", "mstsc"]);
    let has_freerdp_client = contains_any(
        &input.executables,
        &[
            "sdl-freerdp",
            "xfreerdp3",
            "xfreerdp",
            "wfreerdp.exe",
            "wfreerdp",
        ],
    );
    let has_shadow = input.executables.contains("freerdp-shadow-cli");
    let has_gnome = input.executables.contains("grdctl") && input.executables.contains("systemctl");

    let mut clients = Vec::new();
    if has_system_client {
        clients.push(RdpClientKind::System);
    }
    if has_freerdp_client {
        clients.push(RdpClientKind::FreeRdp);
    }

    let recommended_client = if has_system_client {
        Some(RdpClientKind::System)
    } else if has_freerdp_client {
        Some(RdpClientKind::FreeRdp)
    } else {
        None
    };

    let (host_backends, recommended_host, host_error_code) = match (input.os, input.session) {
        (HostOs::Windows, DesktopSession::WindowsConsole) if has_shadow => (
            vec![RdpHostBackend::FreeRdpShadow],
            Some(RdpHostBackend::FreeRdpShadow),
            None,
        ),
        (HostOs::Linux, DesktopSession::X11) if has_shadow => (
            vec![RdpHostBackend::FreeRdpShadow],
            Some(RdpHostBackend::FreeRdpShadow),
            None,
        ),
        (HostOs::Linux, DesktopSession::GnomeWayland) if has_gnome => (
            vec![RdpHostBackend::GnomeRemoteDesktop],
            Some(RdpHostBackend::GnomeRemoteDesktop),
            None,
        ),
        (HostOs::Linux, DesktopSession::OtherWayland) => {
            (Vec::new(), None, Some("unsupported_wayland".to_string()))
        }
        (HostOs::Macos, _) => (Vec::new(), None, Some("macos_host_phase_2".to_string())),
        (HostOs::Windows | HostOs::Linux, _) => {
            (Vec::new(), None, Some("host_backend_missing".to_string()))
        }
        _ => (
            Vec::new(),
            None,
            Some("host_platform_unsupported".to_string()),
        ),
    };

    RdpCapabilities {
        platform: input.os.as_str().to_string(),
        desktop_session: input.session.as_str().to_string(),
        clients,
        host_backends,
        recommended_client,
        recommended_host,
        host_error_code,
        executables: BTreeMap::new(),
    }
}

fn executable_candidates(name: &str) -> Vec<String> {
    if cfg!(target_os = "windows") && Path::new(name).extension().is_none() {
        vec![name.to_string(), format!("{name}.exe")]
    } else {
        vec![name.to_string()]
    }
}

fn find_executable(name: &str, preferred_dirs: &[PathBuf]) -> Option<PathBuf> {
    let candidates = executable_candidates(name);
    for dir in preferred_dirs {
        for candidate in &candidates {
            let path = dir.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    for dir in env::split_paths(&env::var_os("PATH").unwrap_or_default()) {
        for candidate in &candidates {
            let path = dir.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn discover_executables(preferred_dirs: &[PathBuf]) -> BTreeMap<String, PathBuf> {
    CLIENT_EXECUTABLES
        .iter()
        .chain(HOST_EXECUTABLES.iter())
        .filter_map(|name| {
            find_executable(name, preferred_dirs).map(|path| ((*name).to_string(), path))
        })
        .collect()
}

fn preferred_executable_dirs(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(executable) = env::current_exe() {
        if let Some(parent) = executable.parent() {
            dirs.push(parent.to_path_buf());
            dirs.push(parent.join("resources"));
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        dirs.push(resource_dir);
    }
    dirs
}

pub(crate) fn current_capabilities(app: &tauri::AppHandle) -> RdpCapabilities {
    let paths = discover_executables(&preferred_executable_dirs(app));
    let os = HostOs::current();
    let input = DetectionInput {
        os,
        session: DesktopSession::current(os),
        executables: paths.keys().cloned().collect(),
    };
    let mut capabilities = detect_capabilities(&input);
    capabilities.executables = paths
        .into_iter()
        .map(|(name, path)| (name, path.to_string_lossy().to_string()))
        .collect();
    capabilities
}

fn endpoint(profile: &RemoteDeskProfile) -> String {
    format!("{}:{}", profile.host.trim(), profile.port)
}

fn build_client_spec(
    profile: &RemoteDeskProfile,
    client: RdpClientKind,
    executable: &str,
) -> Result<CommandSpec, String> {
    if profile.host.trim().is_empty() {
        return Err("rdp_host_required: 请输入主机地址".to_string());
    }

    let destination = endpoint(profile);
    let args = match client {
        RdpClientKind::System => vec![format!("/v:{destination}")],
        RdpClientKind::FreeRdp => {
            let mut args = vec![format!("/v:{destination}")];
            if !profile.username.trim().is_empty() {
                args.push(format!("/u:{}", profile.username.trim()));
            }
            args
        }
        RdpClientKind::Auto => return Err("rdp_client_unresolved: RDP 客户端尚未解析".to_string()),
    };

    Ok(CommandSpec {
        executable: executable.to_string(),
        args,
    })
}

fn resolved_executable<'a>(
    capabilities: &'a RdpCapabilities,
    kind: RdpClientKind,
) -> Option<&'a str> {
    let names: &[&str] = match kind {
        RdpClientKind::System => &["mstsc.exe", "mstsc"],
        RdpClientKind::FreeRdp => &[
            "sdl-freerdp",
            "xfreerdp3",
            "xfreerdp",
            "wfreerdp.exe",
            "wfreerdp",
        ],
        RdpClientKind::Auto => &[],
    };
    names
        .iter()
        .find_map(|name| capabilities.executables.get(*name).map(String::as_str))
}

fn resolve_client(
    profile: &RemoteDeskProfile,
    capabilities: &RdpCapabilities,
) -> Result<RdpClientKind, String> {
    let kind = match profile.client_mode {
        RdpClientKind::Auto => capabilities.recommended_client,
        selected => Some(selected),
    }
    .ok_or_else(|| "rdp_client_missing: 未找到可用的 RDP 客户端".to_string())?;

    if resolved_executable(capabilities, kind).is_none() {
        return Err(match kind {
            RdpClientKind::System => "rdp_system_client_missing: 未找到系统 RDP 客户端".to_string(),
            _ => "rdp_client_missing: 未找到 FreeRDP 客户端".to_string(),
        });
    }
    Ok(kind)
}

pub(crate) fn launch_profile(
    app: &tauri::AppHandle,
    profile: &RemoteDeskProfile,
    password: Option<&str>,
) -> Result<RdpLaunchResult, String> {
    let capabilities = current_capabilities(app);
    let client = resolve_client(profile, &capabilities)?;
    let executable = resolved_executable(&capabilities, client)
        .ok_or_else(|| "rdp_client_missing: 未找到可用的 RDP 客户端".to_string())?;
    let spec = build_client_spec(profile, client, executable)?;

    if client == RdpClientKind::System && cfg!(target_os = "windows") {
        if let Some(password) = password {
            let target = format!("TERMSRV/{}", profile.host.trim());
            let result = Command::new("cmdkey")
                .args([
                    format!("/generic:{target}"),
                    format!("/user:{}", profile.username.trim()),
                    format!("/pass:{password}"),
                ])
                .status()
                .map_err(|error| format!("rdp_credential_error: {error}"))?;
            if !result.success() {
                return Err("rdp_credential_error: 无法写入 Windows 凭据".to_string());
            }

            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(8));
                let _ = Command::new("cmdkey")
                    .arg(format!("/delete:{target}"))
                    .status();
            });
        }
    }

    Command::new(&spec.executable)
        .args(&spec.args)
        .spawn()
        .map_err(|error| format!("rdp_launch_failed: {error}"))?;

    Ok(RdpLaunchResult {
        client,
        executable: spec.executable,
    })
}

fn local_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(address) = socket.local_addr() {
                return address.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

fn generate_session_password() -> Zeroizing<String> {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let distribution = Uniform::from(0..ALPHABET.len());
    let mut rng = rand::thread_rng();
    let mut characters = (0..20)
        .map(|_| ALPHABET[rng.sample(distribution)] as char)
        .collect::<Vec<_>>();
    characters.extend(['A', 'a', '2', '!']);
    characters.shuffle(&mut rng);
    Zeroizing::new(characters.into_iter().collect())
}

fn build_sam_entry(username: &str, password: &str) -> String {
    let mut utf16 = Zeroizing::new(Vec::with_capacity(password.len() * 2));
    for unit in password.encode_utf16() {
        utf16.extend_from_slice(&unit.to_le_bytes());
    }
    let hash = Md4::digest(utf16.as_slice());
    let hex = hash
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("{username}:::{hex}:::\n")
}

fn create_session_dir(app: &tauri::AppHandle) -> Result<TempDir, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("session_dir_failed: {error}"))?
        .join("remotedesk-rdp");
    fs::create_dir_all(&base).map_err(|error| format!("session_dir_failed: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&base, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("session_dir_failed: {error}"))?;
    }
    tempfile::Builder::new()
        .prefix("session-")
        .tempdir_in(base)
        .map_err(|error| format!("session_dir_failed: {error}"))
}

fn write_private_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .mode(0o600)
            .open(path)
            .map_err(|error| format!("credential_file_failed: {error}"))?;
        file.write_all(contents)
            .map_err(|error| format!("credential_file_failed: {error}"))?;
    }
    #[cfg(not(unix))]
    {
        fs::write(path, contents).map_err(|error| format!("credential_file_failed: {error}"))?;
    }
    Ok(())
}

fn choose_shadow_port() -> Result<u16, String> {
    if let Ok(listener) = TcpListener::bind(("0.0.0.0", 3389)) {
        drop(listener);
        return Ok(3389);
    }
    let listener =
        TcpListener::bind(("0.0.0.0", 0)).map_err(|error| format!("port_in_use: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("port_in_use: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn build_shadow_spec(executable: &str, port: u16, sam_path: &Path) -> CommandSpec {
    CommandSpec {
        executable: executable.to_string(),
        args: vec![
            format!("/port:{port}"),
            "/sec:nla".to_string(),
            format!("/sam-file:{}", sam_path.to_string_lossy()),
            "+may-view".to_string(),
            "+may-interact".to_string(),
        ],
    }
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}")
                .parse()
                .expect("loopback socket address"),
            Duration::from_millis(200),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

fn collect_stderr(mut stderr: impl Read + Send + 'static, tail: Arc<Mutex<String>>) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        while let Ok(read) = stderr.read(&mut buffer) {
            if read == 0 {
                break;
            }
            let chunk = String::from_utf8_lossy(&buffer[..read]);
            let mut current = tail.lock().unwrap();
            current.push_str(&chunk);
            if current.len() > 8192 {
                let split_at = current.len() - 8192;
                *current = current[split_at..].to_string();
            }
        }
    });
}

fn redacted_tail(tail: &Arc<Mutex<String>>) -> String {
    tail.lock()
        .map(|value| value.lines().rev().take(6).collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
}

fn run_checked(executable: &str, args: &[String], code: &str) -> Result<(), String> {
    let output = Command::new(executable)
        .args(args)
        .output()
        .map_err(|error| format!("{code}: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.lines().rev().take(4).collect::<Vec<_>>().join("\n");
        Err(format!("{code}: {detail}"))
    }
}

fn run_with_credentials(
    executable: &str,
    args: &[String],
    username: &str,
    password: &str,
) -> Result<(), String> {
    let mut child = Command::new(executable)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("gnome_credentials_failed: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(format!("{username}\n{password}\n").as_bytes())
            .map_err(|error| format!("gnome_credentials_failed: {error}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("gnome_credentials_failed: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "gnome_credentials_failed: {}",
            detail.lines().rev().take(4).collect::<Vec<_>>().join("\n")
        ))
    }
}

fn start_shadow_runtime(
    app: &tauri::AppHandle,
    capabilities: &RdpCapabilities,
    backend: RdpHostBackend,
    desktop_session: &str,
) -> Result<(RdpHostRuntime, RdpHostInfo), String> {
    let executable = capabilities
        .executables
        .get("freerdp-shadow-cli")
        .ok_or_else(|| "host_backend_missing: 未找到 freerdp-shadow-cli".to_string())?;
    let session_dir = create_session_dir(app)?;
    let username = "devlauncher".to_string();
    let password = generate_session_password();
    let sam_path = session_dir.path().join("SAM");
    write_private_file(
        &sam_path,
        build_sam_entry(&username, password.as_str()).as_bytes(),
    )?;
    let port = choose_shadow_port()?;
    let spec = build_shadow_spec(executable, port, &sam_path);
    let mut child = Command::new(&spec.executable)
        .args(&spec.args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("host_start_failed: {error}"))?;
    let stderr_tail = Arc::new(Mutex::new(String::new()));
    if let Some(stderr) = child.stderr.take() {
        collect_stderr(stderr, Arc::clone(&stderr_tail));
    }
    if !wait_for_port(port, Duration::from_secs(5)) {
        let _ = child.kill();
        let detail = redacted_tail(&stderr_tail);
        return Err(if detail.is_empty() {
            "host_not_ready: RDP 主机未在五秒内就绪".to_string()
        } else {
            format!("host_not_ready: {detail}")
        });
    }

    let address = local_ip();
    let info = RdpHostInfo {
        backend,
        desktop_session: desktop_session.to_string(),
        address: address.clone(),
        port,
        username: username.clone(),
        password: password.to_string(),
        tls: true,
        nla: true,
    };
    let runtime = RdpHostRuntime {
        backend,
        address,
        port,
        _username: username,
        _password: password,
        child: Some(child),
        _session_dir: session_dir,
        stderr_tail,
        gnome_managed: false,
    };
    Ok((runtime, info))
}

fn is_systemd_user_active(systemctl: &str) -> bool {
    Command::new(systemctl)
        .args([
            "--user",
            "is-active",
            "--quiet",
            "gnome-remote-desktop.service",
        ])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn stop_gnome_runtime(capabilities: &RdpCapabilities) {
    if let Some(grdctl) = capabilities.executables.get("grdctl") {
        let _ = Command::new(grdctl).args(["rdp", "disable"]).status();
    }
    if let Some(systemctl) = capabilities.executables.get("systemctl") {
        let _ = Command::new(systemctl)
            .args(["--user", "disable", "--now", "gnome-remote-desktop.service"])
            .status();
    }
}

fn start_gnome_runtime(
    app: &tauri::AppHandle,
    capabilities: &RdpCapabilities,
    desktop_session: &str,
) -> Result<(RdpHostRuntime, RdpHostInfo), String> {
    let grdctl = capabilities
        .executables
        .get("grdctl")
        .ok_or_else(|| "host_backend_missing: 未找到 grdctl".to_string())?;
    let systemctl = capabilities
        .executables
        .get("systemctl")
        .ok_or_else(|| "host_backend_missing: 未找到 systemctl".to_string())?;
    let makecert = capabilities
        .executables
        .get("winpr-makecert")
        .ok_or_else(|| "certificate_tool_missing: 未找到 winpr-makecert".to_string())?;
    if is_systemd_user_active(systemctl) {
        return Err(
            "existing_rdp_service: GNOME 远程桌面已运行，DevLauncher 不会覆盖现有配置".to_string(),
        );
    }

    let session_dir = create_session_dir(app)?;
    let username = "devlauncher".to_string();
    let password = generate_session_password();
    run_checked(
        makecert,
        &[
            "-silent".to_string(),
            "-rdp".to_string(),
            "-path".to_string(),
            session_dir.path().to_string_lossy().to_string(),
            "tls".to_string(),
        ],
        "certificate_generation_failed",
    )?;
    let key = session_dir.path().join("tls.key");
    let certificate = session_dir.path().join("tls.crt");
    if !key.exists() || !certificate.exists() {
        return Err("certificate_generation_failed: 未生成 tls.key 和 tls.crt".to_string());
    }

    let configure_result = (|| {
        run_checked(
            grdctl,
            &[
                "rdp".to_string(),
                "set-tls-key".to_string(),
                key.to_string_lossy().to_string(),
            ],
            "gnome_config_failed",
        )?;
        run_checked(
            grdctl,
            &[
                "rdp".to_string(),
                "set-tls-cert".to_string(),
                certificate.to_string_lossy().to_string(),
            ],
            "gnome_config_failed",
        )?;
        run_with_credentials(
            grdctl,
            &["rdp".to_string(), "set-credentials".to_string()],
            &username,
            password.as_str(),
        )?;
        run_checked(
            grdctl,
            &["rdp".to_string(), "disable-view-only".to_string()],
            "gnome_config_failed",
        )?;
        run_checked(
            grdctl,
            &["rdp".to_string(), "enable".to_string()],
            "gnome_config_failed",
        )?;
        run_checked(
            systemctl,
            &[
                "--user".to_string(),
                "enable".to_string(),
                "--now".to_string(),
                "gnome-remote-desktop.service".to_string(),
            ],
            "gnome_service_failed",
        )
    })();

    if let Err(error) = configure_result {
        stop_gnome_runtime(capabilities);
        return Err(error);
    }
    if !wait_for_port(3389, Duration::from_secs(5)) {
        stop_gnome_runtime(capabilities);
        return Err("host_not_ready: GNOME RDP 主机未在五秒内就绪".to_string());
    }

    let address = local_ip();
    let info = RdpHostInfo {
        backend: RdpHostBackend::GnomeRemoteDesktop,
        desktop_session: desktop_session.to_string(),
        address: address.clone(),
        port: 3389,
        username: username.clone(),
        password: password.to_string(),
        tls: true,
        nla: true,
    };
    let runtime = RdpHostRuntime {
        backend: RdpHostBackend::GnomeRemoteDesktop,
        address,
        port: 3389,
        _username: username,
        _password: password,
        child: None,
        _session_dir: session_dir,
        stderr_tail: Arc::new(Mutex::new(String::new())),
        gnome_managed: true,
    };
    Ok((runtime, info))
}

fn stop_runtime(app: &tauri::AppHandle, mut runtime: RdpHostRuntime) {
    if let Some(child) = runtime.child.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    if runtime.gnome_managed {
        stop_gnome_runtime(&current_capabilities(app));
    }
}

#[tauri::command]
pub fn start_rdp_host(app: tauri::AppHandle) -> Result<RdpHostInfo, String> {
    let state = app.state::<RdpHostState>();
    if let Some(runtime) = state.runtime.lock().unwrap().take() {
        stop_runtime(&app, runtime);
    }
    *state.last_error.lock().unwrap() = None;

    let capabilities = current_capabilities(&app);
    let backend = capabilities.recommended_host.ok_or_else(|| {
        let code = capabilities
            .host_error_code
            .clone()
            .unwrap_or_else(|| "host_backend_missing".to_string());
        format!("{code}: 当前环境没有可用的当前桌面 RDP 主机后端")
    })?;
    let result = match backend {
        RdpHostBackend::FreeRdpShadow => {
            start_shadow_runtime(&app, &capabilities, backend, &capabilities.desktop_session)
        }
        RdpHostBackend::GnomeRemoteDesktop => {
            start_gnome_runtime(&app, &capabilities, &capabilities.desktop_session)
        }
    };

    match result {
        Ok((runtime, info)) => {
            *state.runtime.lock().unwrap() = Some(runtime);
            Ok(info)
        }
        Err(error) => {
            let (code, message) = error
                .split_once(':')
                .map(|(code, message)| (code.trim().to_string(), message.trim().to_string()))
                .unwrap_or_else(|| ("host_start_failed".to_string(), error.clone()));
            *state.last_error.lock().unwrap() = Some((code, message));
            Err(error)
        }
    }
}

#[tauri::command]
pub fn stop_rdp_host(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<RdpHostState>();
    if let Some(runtime) = state.runtime.lock().unwrap().take() {
        stop_runtime(&app, runtime);
    }
    *state.last_error.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn get_rdp_host_status(app: tauri::AppHandle) -> RdpHostStatus {
    let capabilities = current_capabilities(&app);
    let state = app.state::<RdpHostState>();
    let mut runtime_guard = state.runtime.lock().unwrap();

    let unexpected_exit = runtime_guard.as_mut().and_then(|runtime| {
        runtime
            .child
            .as_mut()
            .and_then(|child| match child.try_wait() {
                Ok(Some(status)) => Some((
                    "host_exited".to_string(),
                    format!(
                        "RDP 主机已退出 ({status}) {}",
                        redacted_tail(&runtime.stderr_tail)
                    )
                    .trim()
                    .to_string(),
                )),
                Ok(None) => None,
                Err(error) => Some((
                    "host_status_failed".to_string(),
                    format!("无法读取 RDP 主机状态: {error}"),
                )),
            })
    });
    if let Some(error) = unexpected_exit {
        runtime_guard.take();
        *state.last_error.lock().unwrap() = Some(error);
    }

    if let Some(runtime) = runtime_guard.as_ref() {
        return RdpHostStatus {
            running: true,
            backend: Some(runtime.backend),
            desktop_session: capabilities.desktop_session,
            address: Some(runtime.address.clone()),
            port: Some(runtime.port),
            tls: true,
            nla: true,
            error_code: None,
            error_message: None,
        };
    }

    let error = state.last_error.lock().unwrap().clone();
    RdpHostStatus {
        running: false,
        backend: None,
        desktop_session: capabilities.desktop_session,
        address: None,
        port: None,
        tls: false,
        nla: false,
        error_code: error.as_ref().map(|value| value.0.clone()),
        error_message: error.map(|value| value.1),
    }
}

#[tauri::command]
pub fn get_rdp_capabilities(app: tauri::AppHandle) -> RdpCapabilities {
    current_capabilities(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(os: HostOs, session: DesktopSession, bins: &[&str]) -> DetectionInput {
        DetectionInput {
            os,
            session,
            executables: bins.iter().map(|value| (*value).to_string()).collect(),
        }
    }

    #[test]
    fn selects_shadow_for_windows_current_desktop() {
        let result = detect_capabilities(&env(
            HostOs::Windows,
            DesktopSession::WindowsConsole,
            &["freerdp-shadow-cli", "mstsc"],
        ));
        assert_eq!(result.recommended_host, Some(RdpHostBackend::FreeRdpShadow));
        assert_eq!(result.recommended_client, Some(RdpClientKind::System));
    }

    #[test]
    fn selects_gnome_for_wayland_current_desktop() {
        let result = detect_capabilities(&env(
            HostOs::Linux,
            DesktopSession::GnomeWayland,
            &["grdctl", "systemctl", "xfreerdp"],
        ));
        assert_eq!(
            result.recommended_host,
            Some(RdpHostBackend::GnomeRemoteDesktop)
        );
    }

    #[test]
    fn rejects_unknown_wayland_instead_of_creating_an_independent_session() {
        let result = detect_capabilities(&env(
            HostOs::Linux,
            DesktopSession::OtherWayland,
            &["freerdp-shadow-cli"],
        ));
        assert_eq!(result.recommended_host, None);
        assert_eq!(
            result.host_error_code.as_deref(),
            Some("unsupported_wayland")
        );
    }

    #[test]
    fn gates_macos_host_but_allows_freerdp_client() {
        let result = detect_capabilities(&env(
            HostOs::Macos,
            DesktopSession::MacosConsole,
            &["sdl-freerdp"],
        ));
        assert_eq!(result.recommended_host, None);
        assert_eq!(result.recommended_client, Some(RdpClientKind::FreeRdp));
        assert_eq!(
            result.host_error_code.as_deref(),
            Some("macos_host_phase_2")
        );
    }

    fn fixture_profile(client_mode: RdpClientKind) -> RemoteDeskProfile {
        RemoteDeskProfile {
            id: "one".to_string(),
            name: "Lab".to_string(),
            host: "10.0.0.8".to_string(),
            port: 3389,
            username: "dev".to_string(),
            client_mode,
            has_password: Some(true),
        }
    }

    #[test]
    fn old_profile_defaults_to_auto_client() {
        let profile: RemoteDeskProfile = serde_json::from_str(
            r#"{"id":"one","name":"Lab","host":"10.0.0.8","port":3389,"username":"dev"}"#,
        )
        .unwrap();
        assert_eq!(profile.client_mode, RdpClientKind::Auto);
    }

    #[test]
    fn freerdp_launch_spec_contains_endpoint_and_username_but_not_password() {
        let profile = fixture_profile(RdpClientKind::FreeRdp);
        let spec =
            build_client_spec(&profile, RdpClientKind::FreeRdp, "/usr/bin/sdl-freerdp").unwrap();
        assert!(spec.args.contains(&"/v:10.0.0.8:3389".to_string()));
        assert!(spec.args.contains(&"/u:dev".to_string()));
        assert!(spec.args.iter().all(|arg| !arg.starts_with("/p:")));
    }

    #[test]
    fn sam_entry_contains_nt_hash_and_not_plaintext_password() {
        let entry = build_sam_entry("devlauncher", "Correct Horse Battery Staple!");
        assert!(entry.starts_with("devlauncher:::"));
        assert!(!entry.contains("Correct Horse"));
        assert_eq!(entry.trim().split(':').nth(3).unwrap().len(), 32);
    }

    #[test]
    fn generated_password_is_long_and_uses_multiple_character_classes() {
        let password = generate_session_password();
        assert_eq!(password.len(), 24);
        assert!(password.chars().any(|value| value.is_ascii_uppercase()));
        assert!(password.chars().any(|value| value.is_ascii_lowercase()));
        assert!(password.chars().any(|value| value.is_ascii_digit()));
        assert!(password.chars().any(|value| "!@#$%".contains(value)));
    }

    #[test]
    fn shadow_spec_enables_nla_and_interaction() {
        let spec = build_shadow_spec(
            "freerdp-shadow-cli",
            3391,
            Path::new("/tmp/devlauncher-SAM"),
        );
        assert!(spec.args.contains(&"/sec:nla".to_string()));
        assert!(spec
            .args
            .contains(&"/sam-file:/tmp/devlauncher-SAM".to_string()));
        assert!(spec.args.contains(&"+may-interact".to_string()));
    }
}
