use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::Manager;

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
const HOST_EXECUTABLES: &[&str] = &["freerdp-shadow-cli", "grdctl", "systemctl"];

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
}
