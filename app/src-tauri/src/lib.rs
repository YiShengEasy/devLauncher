use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use futures_util::{SinkExt, StreamExt};
use image::{DynamicImage, ImageFormat, RgbaImage, imageops};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

// -----------------------------------------------
// Built-in Terminal (xterm.js + PTY)
// -----------------------------------------------

/// Safety: portable-pty's concrete MasterPty implementations
/// (ConPtyMaster on Windows, UnixMasterPty on Unix) use thread-safe
/// OS handles (HANDLE / fd) and are safe to move across threads.
struct SendableMaster(Box<dyn portable_pty::MasterPty>);
unsafe impl Send for SendableMaster {}
unsafe impl Sync for SendableMaster {}

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: SendableMaster,
}

pub struct TerminalState {
    pub sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    /// Command staged by `terminal_run`; consumed once by `terminal_take_pending_cmd`.
    pub pending_cmd: Arc<Mutex<Option<String>>>,
}

/// Spawn a PTY process and begin streaming its output as Tauri events.
#[tauri::command]
fn terminal_spawn(
    app: tauri::AppHandle,
    session_id: String,
    cmd: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cb = CommandBuilder::new(&cmd);
    for arg in &args {
        cb.arg(arg);
    }

    let _child = pair.slave.spawn_command(cb).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    // Store session (writer + master for resize)
    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(
            session_id.clone(),
            PtySession { writer, master: SendableMaster(pair.master) },
        );
    }

    // Relay PTY output → Tauri events (base64-encoded bytes)
    let sid = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app.emit(&format!("terminal-exit-{}", sid), ());
                    break;
                }
                Ok(n) => {
                    let b64 = BASE64.encode(&buf[..n]);
                    let _ = app.emit(&format!("terminal-data-{}", sid), b64);
                }
            }
        }
    });

    Ok(())
}

/// Send raw bytes (base64-encoded) to the PTY's stdin.
#[tauri::command]
fn terminal_write(
    session_id: String,
    data: String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let bytes = BASE64.decode(&data).map_err(|e| e.to_string())?;
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get_mut(&session_id) {
        s.writer.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Notify the PTY of a terminal resize.
#[tauri::command]
fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get(&session_id) {
        s.master.0
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Kill a PTY session and release its resources.
#[tauri::command]
fn terminal_kill(
    session_id: String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    state.sessions.lock().unwrap().remove(&session_id);
    Ok(())
}

/// Stage a command and show the terminal window; the frontend polls once on mount.
#[tauri::command]
fn terminal_run(
    app: tauri::AppHandle,
    cmd: String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    *state.pending_cmd.lock().unwrap() = Some(cmd);
    if let Some(win) = app.get_webview_window("terminal") {
        if !win.is_visible().unwrap_or(false) {
            win.show().map_err(|e| e.to_string())?;
        }
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Take (and clear) any pending command staged by `terminal_run`.
#[tauri::command]
fn terminal_take_pending_cmd(
    state: tauri::State<'_, TerminalState>,
) -> Option<String> {
    state.pending_cmd.lock().unwrap().take()
}

/// Toggle terminal window visibility.
#[tauri::command]
fn toggle_terminal_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("terminal") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
use tauri::{
    Emitter,
    Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

// -----------------------------------------------
// ID Generator
// -----------------------------------------------

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

fn generate_id() -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let count = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:x}{:x}", ts, count)
}

// -----------------------------------------------
// Data Structures
// -----------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Action {
    App {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        target: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        args: Option<Vec<String>>,
    },
    Folder {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        target: String,
        #[serde(rename = "openWith", alias = "open_with", skip_serializing_if = "Option::is_none")]
        open_with: Option<String>,
        #[serde(rename = "customOpener", alias = "custom_opener", skip_serializing_if = "Option::is_none")]
        custom_opener: Option<String>,
        #[serde(rename = "customOpenerArgs", alias = "custom_opener_args", skip_serializing_if = "Option::is_none")]
        custom_opener_args: Option<String>,
    },
    File {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        target: String,
    },
    Url {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        target: String,
    },
    Ssh {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        host: String,
        user: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        port: Option<u16>,
        #[serde(skip_serializing_if = "Option::is_none")]
        identity: Option<String>,
        /// Password is stored in OS keychain, NOT here. This flag just marks that one exists.
        #[serde(skip_serializing_if = "Option::is_none")]
        has_password: Option<bool>,
        /// Preferred terminal for launching the SSH session.
        #[serde(skip_serializing_if = "Option::is_none")]
        terminal: Option<String>,
    },
    Script {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        shell: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        file: Option<String>,
    },
    System {
        name: String,
        command: String,
    },
    Builtin {
        name: String,
        feature: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Page {
    pub name: String,
    pub keys: HashMap<String, Action>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ThemeConfig {
    #[serde(default = "default_bg_color")]
    pub bg_color: String,
    #[serde(default = "default_bg_opacity")]
    pub bg_opacity: f64,
    #[serde(default = "default_blur_radius")]
    pub blur_radius: f64,
    #[serde(default = "default_border_color")]
    pub border_color: String,
    #[serde(default = "default_key_bg_opacity")]
    pub key_bg_opacity: f64,
}

fn default_bg_color() -> String { "#10121f".to_string() }
fn default_bg_opacity() -> f64 { 0.82 }
fn default_blur_radius() -> f64 { 32.0 }
fn default_border_color() -> String { "#ffffff1a".to_string() }
fn default_key_bg_opacity() -> f64 { 0.04 }

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            bg_color: default_bg_color(),
            bg_opacity: default_bg_opacity(),
            blur_radius: default_blur_radius(),
            border_color: default_border_color(),
            key_bg_opacity: default_key_bg_opacity(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KeyboardConfig {
    pub pages: Vec<Page>,
    #[serde(default)]
    pub theme: ThemeConfig,
}

// -----------------------------------------------
// Clipboard Entry (text + image, with ID)
// -----------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ClipboardEntry {
    Text { id: String, content: String },
    Image {
        id: String,
        data: String,   // base64 JPEG (volatile, for API)
        width: u32,
        height: u32,
    },
}

impl ClipboardEntry {
    fn id(&self) -> &str {
        match self {
            ClipboardEntry::Text { id, .. } => id,
            ClipboardEntry::Image { id, .. } => id,
        }
    }
}

// -----------------------------------------------
// Config path
// -----------------------------------------------

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    data_dir.join("keyboard.yaml")
}

fn default_config() -> KeyboardConfig {
    KeyboardConfig { pages: vec![], theme: ThemeConfig::default() }
}

// -----------------------------------------------
// Clipboard Favorites Persistence
// -----------------------------------------------

fn favorites_path(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    data_dir.join("clipboard_favorites.json")
}

fn favorites_images_dir(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    data_dir.join("clipboard_images")
}

fn save_clipboard_favorites(
    app: &tauri::AppHandle,
    favorites: &[ClipboardEntry],
) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let img_dir = dir.join("clipboard_images");
    fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;

    // Build persisted JSON: image entries store file reference instead of data
    let persisted: Vec<serde_json::Value> = favorites
        .iter()
        .map(|entry| match entry {
            ClipboardEntry::Text { id, content } => serde_json::json!({
                "kind": "text",
                "id": id,
                "content": content,
            }),
            ClipboardEntry::Image {
                id,
                data,
                width,
                height,
            } => {
                // Save image bytes to file
                let filename = format!("{}.jpg", id);
                let img_path = img_dir.join(&filename);
                if let Ok(bytes) = BASE64.decode(data) {
                    let _ = fs::write(&img_path, &bytes);
                }
                serde_json::json!({
                    "kind": "image",
                    "id": id,
                    "file": filename,
                    "width": width,
                    "height": height,
                })
            }
        })
        .collect();

    let json = serde_json::to_string_pretty(&persisted).map_err(|e| e.to_string())?;
    fs::write(favorites_path(app), json).map_err(|e| e.to_string())
}

fn load_clipboard_favorites(app: &tauri::AppHandle) -> Result<Vec<ClipboardEntry>, String> {
    let path = favorites_path(app);
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let values: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let img_dir = dir.join("clipboard_images");

    values
        .iter()
        .map(|v| {
            let kind = v["kind"].as_str().unwrap_or("");
            match kind {
                "text" => Ok(ClipboardEntry::Text {
                    id: v["id"].as_str().unwrap_or("").to_string(),
                    content: v["content"].as_str().unwrap_or("").to_string(),
                }),
                "image" => {
                    let id = v["id"].as_str().unwrap_or("").to_string();
                    let file = v["file"].as_str().unwrap_or("");
                    let img_path = img_dir.join(file);
                    if !img_path.exists() {
                        return Err(format!("image file not found: {}", file));
                    }
                    let bytes = fs::read(&img_path).map_err(|e| e.to_string())?;
                    let data = BASE64.encode(&bytes);
                    Ok(ClipboardEntry::Image {
                        id,
                        data,
                        width: v["width"].as_u64().unwrap_or(0) as u32,
                        height: v["height"].as_u64().unwrap_or(0) as u32,
                    })
                }
                _ => Err(format!("unknown kind: {}", kind)),
            }
        })
        .filter_map(|r| r.ok()) // skip broken entries
        .collect::<Vec<_>>()
        .into_iter()
        .map(Ok)
        .collect()
}

// -----------------------------------------------
// Commands
// -----------------------------------------------

#[tauri::command]
fn load_config(app: tauri::AppHandle) -> Result<KeyboardConfig, String> {
    let path = config_path(&app);
    if !path.exists() {
        return Ok(default_config());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_yaml::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config: KeyboardConfig) -> Result<(), String> {
    let path = config_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_yaml::to_string(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_config_path(app: tauri::AppHandle) -> String {
    config_path(&app).to_string_lossy().to_string()
}

fn split_command_args(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for ch in input.chars() {
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            } else {
                current.push(ch);
            }
            continue;
        }
        match ch {
            '"' | '\'' => quote = Some(ch),
            c if c.is_whitespace() => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

fn spawn_first(candidates: &[String], args: &[String]) -> Result<(), String> {
    let mut last_err = None;
    for candidate in candidates {
        match std::process::Command::new(candidate).args(args).spawn() {
            Ok(_) => return Ok(()),
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    Err(last_err.unwrap_or_else(|| "no opener candidates".to_string()))
}

fn folder_opener_candidates(open_with: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    match open_with {
        "vscode" => {
            candidates.push("code".to_string());
            candidates.push("code.cmd".to_string());
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                candidates.push(format!(r"{}\Programs\Microsoft VS Code\Code.exe", local));
            }
            if let Ok(program_files) = std::env::var("ProgramFiles") {
                candidates.push(format!(r"{}\Microsoft VS Code\Code.exe", program_files));
            }
        }
        "cursor" => {
            candidates.push("cursor".to_string());
            candidates.push("cursor.cmd".to_string());
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                candidates.push(format!(r"{}\Programs\Cursor\Cursor.exe", local));
            }
            if let Ok(program_files) = std::env::var("ProgramFiles") {
                candidates.push(format!(r"{}\Cursor\Cursor.exe", program_files));
            }
        }
        _ => {
            #[cfg(target_os = "windows")]
            candidates.push("explorer.exe".to_string());
        }
    }
    candidates
}

fn open_folder_with(action: &serde_json::Value, target: &str) -> Result<(), String> {
    let open_with = action["openWith"]
        .as_str()
        .or_else(|| action["open_with"].as_str())
        .unwrap_or("explorer");

    if open_with == "custom" {
        let opener = action["customOpener"]
            .as_str()
            .or_else(|| action["custom_opener"].as_str())
            .ok_or("missing custom opener")?;
        let template = action["customOpenerArgs"]
            .as_str()
            .or_else(|| action["custom_opener_args"].as_str())
            .unwrap_or("{path}");
        let args = if template.trim().is_empty() || template.trim() == "{path}" {
            vec![target.to_string()]
        } else {
            split_command_args(&template.replace("{path}", target))
        };
        return std::process::Command::new(opener)
            .args(args)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }

    let candidates = folder_opener_candidates(open_with);
    if !candidates.is_empty() {
        return spawn_first(&candidates, &[target.to_string()]);
    }

    open::that(target).map_err(|e| e.to_string())
}

// -----------------------------------------------
// SSH password – stored in OS credential store (Windows Credential Manager)
// Never written to the YAML config file.
// -----------------------------------------------

#[tauri::command]
fn save_ssh_password(key: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new("DevLauncher", &key).map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_ssh_password(key: String) -> Result<(), String> {
    match keyring::Entry::new("DevLauncher", &key) {
        Ok(entry) => {
            // Ignore "not found" – deletion is best-effort
            let _ = entry.delete_credential();
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn execute_action(
    app: tauri::AppHandle,
    action: serde_json::Value,
    term_state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let action_type = action["type"].as_str().unwrap_or("");
    match action_type {
        "app" => {
            let target = action["target"].as_str().ok_or("missing target")?;
            let args: Vec<String> = action["args"]
                .as_array()
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            std::process::Command::new(target)
                .args(&args)
                .spawn()
                .map_err(|e| format!("启动失败: {}", e))?;
        }
        "folder" => {
            let target = action["target"].as_str().ok_or("missing target")?;
            open_folder_with(&action, target)?;
        }
        "file" | "url" => {
            let target = action["target"].as_str().ok_or("missing target")?;
            open::that(target).map_err(|e| e.to_string())?;
        }
        "ssh" => {
            let host = action["host"].as_str().ok_or("missing host")?;
            let user = action["user"].as_str().ok_or("missing user")?;
            let port = action["port"].as_u64().unwrap_or(22);
            let terminal_pref = action["terminal"].as_str().unwrap_or("auto");
            let ssh_target = format!("{}@{}", user, host);
            let port_str = port.to_string();
            let cred_key = format!("ssh:{}@{}:{}", user, host, port);

            // Fetch stored password from OS credential store
            let password: Option<String> = keyring::Entry::new("DevLauncher", &cred_key)
                .ok()
                .and_then(|e| e.get_password().ok());

            // ── Helpers ─────────────────────────────────────────────────────────────

            // Open an SSH session using Git Bash + expect (auto-fills password).
            // Returns true if launched successfully.
            let launch_gitbash_expect = |pwd: &str| -> bool {
                // git-bash.exe is mintty (the actual terminal emulator), NOT headless bash.exe
                let gitbash_candidates = [
                    r"C:\Program Files\Git\git-bash.exe",
                    r"C:\Program Files (x86)\Git\git-bash.exe",
                ];
                let gitbash = gitbash_candidates.iter().find(|p| std::path::Path::new(p).exists());
                let Some(&gitbash_exe) = gitbash else { return false; };

                // Escape password for embedding in a double-quoted string
                let safe_pwd = pwd
                    .replace('\\', "\\\\")
                    .replace('"', "\\\"")
                    .replace('$', "\\$")
                    .replace('`', "\\`");
                let port_opt = if port == 22 { String::new() } else { format!("-p {} ", port) };

                // Write a temp expect script to avoid inline quoting complexity
                let script_path = std::env::temp_dir()
                    .join(format!("dl_ssh_{}.exp", std::process::id()));
                // Convert Windows path to MSYS/POSIX path: C:\foo -> /c/foo
                let win = script_path.to_string_lossy().to_string();
                let msys_path = if win.len() >= 2 && win.as_bytes()[1] == b':' {
                    let drive = win.chars().next().unwrap().to_ascii_lowercase();
                    let rest = win[2..].replace('\\', "/");
                    format!("/{}{}", drive, rest)
                } else {
                    win.replace('\\', "/")
                };

                let expect_script = format!(
                    "#!/usr/bin/expect -f\nlog_user 1\nspawn ssh {port_opt}{ssh_target}\n\
                     expect {{\n  \"yes/no\" {{ send \"yes\\r\"; exp_continue }}\n\
                     \"password:*\" {{ send \"{safe_pwd}\\r\"; interact }}\n\
                     timeout {{ interact }}\n}}\n"
                );
                if std::fs::write(&script_path, expect_script.as_bytes()).is_err() {
                    return false;
                }

                // git-bash.exe -c "expect '/msys/path/script.exp'; exec bash"
                // 'exec bash' keeps the mintty window open after expect exits
                let bash_cmd = format!("expect '{}'; exec bash", msys_path);
                std::process::Command::new(gitbash_exe)
                    .args(["-c", &bash_cmd])
                    .spawn().is_ok()
            };

            // Open SSH using plink -pw (PuTTY). Returns true if launched.
            let launch_plink = |pwd: &str| -> bool {
                let plink_candidates = [
                    "plink",
                    r"C:\Program Files\PuTTY\plink.exe",
                    r"C:\Program Files (x86)\PuTTY\plink.exe",
                ];
                let plink = plink_candidates.iter().find(|&&p| {
                    std::process::Command::new(p).arg("-V").output()
                        .map(|o| !o.stdout.is_empty() || !o.stderr.is_empty())
                        .unwrap_or(false)
                });
                let Some(&plink_exe) = plink else { return false; };

                let plink_args_wt: Vec<&str> = vec!["--", plink_exe, "-ssh", "-pw", pwd, "-P", &port_str, &ssh_target];
                let cmd_line = format!("{} -ssh -pw {} -P {} {}", plink_exe, pwd, port_str, ssh_target);
                if std::process::Command::new("wt.exe").args(&plink_args_wt).spawn().is_ok() { return true; }
                std::process::Command::new("cmd")
                    .args(["/C", "start", "cmd", "/K", &cmd_line])
                    .spawn().is_ok()
            };

            // Plain SSH (no auto password) using the given terminal preference.
            let launch_plain = || -> Result<(), String> {
                let ssh_args_base: Vec<String> = if port == 22 {
                    vec![ssh_target.clone()]
                } else {
                    vec!["-p".to_string(), port_str.clone(), ssh_target.clone()]
                };
                let ssh_args: Vec<&str> = ssh_args_base.iter().map(|s| s.as_str()).collect();

                match terminal_pref {
                    "wt" => {
                        let mut a = vec!["ssh"];
                        a.extend(&ssh_args);
                        std::process::Command::new("wt.exe").args(&a).spawn().map_err(|e| e.to_string())?;
                    }
                    "cmd" => {
                        let mut a = vec!["/C", "start", "cmd", "/K", "ssh"];
                        a.extend(&ssh_args);
                        std::process::Command::new("cmd").args(&a).spawn().map_err(|e| e.to_string())?;
                    }
                    "powershell" => {
                        let ssh_cmd = format!("ssh {}", ssh_args.join(" "));
                        std::process::Command::new("powershell")
                            .args(["-NoExit", "-Command", &ssh_cmd])
                            .spawn().map_err(|e| e.to_string())?;
                    }
                    "gitbash" => {
                        let gitbash_candidates = [
                            r"C:\Program Files\Git\git-bash.exe",
                            r"C:\Program Files (x86)\Git\git-bash.exe",
                        ];
                        let gitbash = gitbash_candidates.iter()
                            .find(|p| std::path::Path::new(p).exists())
                            .ok_or("Git Bash 未找到 (需安装 Git for Windows)")?;
                        // git-bash.exe is mintty; -c runs a command, exec bash keeps window open
                        let ssh_cmd = format!("ssh {}; exec bash", ssh_args.join(" "));
                        std::process::Command::new(gitbash)
                            .args(["-c", &ssh_cmd])
                            .spawn()
                            .map_err(|e| e.to_string())?;
                    }
                    _ => {
                        // auto: try wt first, fallback cmd
                        let mut a = vec!["ssh"];
                        a.extend(&ssh_args);
                        if std::process::Command::new("wt.exe").args(&a).spawn().is_err() {
                            let mut ca = vec!["/C", "start", "cmd", "/K", "ssh"];
                            ca.extend(&ssh_args);
                            std::process::Command::new("cmd").args(&ca).spawn().map_err(|e| e.to_string())?;
                        }
                    }
                }
                Ok(())
            };

            // ── Dispatch ──────────────────────────────────────────────────────────

            // Built-in terminal: stage the SSH command and open the terminal window.
            // The user can type the password interactively inside xterm.
            if terminal_pref == "terminal" {
                let port_flag = if port == 22 {
                    String::new()
                } else {
                    format!("-p {} ", port)
                };
                let ssh_cmd = format!("ssh {}{}", port_flag, ssh_target);
                *term_state.pending_cmd.lock().unwrap() = Some(ssh_cmd);
                if let Some(win) = app.get_webview_window("terminal") {
                    if !win.is_visible().unwrap_or(false) {
                        win.show().map_err(|e| e.to_string())?;
                    }
                    win.set_focus().map_err(|e| e.to_string())?;
                }
                return Ok(());
            }

            if let Some(ref pwd) = password {
                let launched = match terminal_pref {
                    "gitbash" => launch_gitbash_expect(pwd),
                    _ => {
                        // Try plink first (works in any terminal), then Git Bash expect
                        if launch_plink(pwd) { true } else { launch_gitbash_expect(pwd) }
                    }
                };
                if !launched {
                    // Password tools unavailable – fall back to plain SSH (user types manually)
                    launch_plain()?;
                }
            } else {
                launch_plain()?;
            }
        }
        "script" => {
            let shell = action["shell"].as_str().unwrap_or("powershell");
            let content = action["content"].as_str().unwrap_or("");
            match shell {
                "powershell" => {
                    std::process::Command::new("powershell")
                        .args(["-NoExit", "-Command", content])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "cmd" | "bat" => {
                    std::process::Command::new("cmd")
                        .args(["/K", content])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "wsl" => {
                    let distro = action["distro"].as_str().unwrap_or("Ubuntu");
                    if content.is_empty() {
                        // Open an interactive WSL terminal (no script to run)
                        if std::process::Command::new("wt.exe")
                            .args(["new-tab", "wsl.exe", "-d", distro])
                            .spawn()
                            .is_err()
                        {
                            std::process::Command::new("cmd")
                                .args(["/C", "start", "", "wsl.exe", "-d", distro])
                                .spawn()
                                .map_err(|e| e.to_string())?;
                        }
                    } else if content.trim().ends_with(".sh") {
                        // .sh file path → run script then keep shell open
                        let script_path = content.trim();
                        let inner = format!("bash -l '{}'; exec bash", script_path.replace("'", "'\\''"));
                        // wt.exe treats ; as command separator → escape as \;
                        let wt_inner = inner.replace(";", "\\;");
                        if std::process::Command::new("wt.exe")
                            .args(["new-tab", "wsl.exe", "-d", distro, "-e", "bash", "-l", "-c", &wt_inner])
                            .spawn()
                            .is_err()
                        {
                            // cmd.exe does not need escaping
                            std::process::Command::new("cmd")
                                .args(["/C", "start", "", "wsl.exe", "-d", distro, "-e", "bash", "-l", "-c", &inner])
                                .spawn()
                                .map_err(|e| e.to_string())?;
                        }
                    } else {
                        // Inline commands → run then keep shell open
                        let inner = format!("{}; exec bash", content);
                        let wt_inner = inner.replace(";", "\\;");
                        if std::process::Command::new("wt.exe")
                            .args(["new-tab", "wsl.exe", "-d", distro, "-e", "bash", "-l", "-c", &wt_inner])
                            .spawn()
                            .is_err()
                        {
                            std::process::Command::new("cmd")
                                .args(["/C", "start", "", "wsl.exe", "-d", distro, "-e", "bash", "-l", "-c", &inner])
                                .spawn()
                                .map_err(|e| e.to_string())?;
                        }
                    }
                }
                _ => {}
            }
        }
        "system" => {
            let cmd = action["command"].as_str().unwrap_or("");
            match cmd {
                "lock" => {
                    std::process::Command::new("rundll32.exe")
                        .args(["user32.dll,LockWorkStation"])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "sleep" => {
                    std::process::Command::new("powershell")
                        .args(["-Command", "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "calculator" => { std::process::Command::new("calc.exe").spawn().map_err(|e| e.to_string())?; }
                "notepad" => { std::process::Command::new("notepad.exe").spawn().map_err(|e| e.to_string())?; }
                "explorer" => { std::process::Command::new("explorer.exe").spawn().map_err(|e| e.to_string())?; }
                "taskmanager" => { std::process::Command::new("taskmgr.exe").spawn().map_err(|e| e.to_string())?; }
                "shutdown" => { std::process::Command::new("shutdown").args(["/s", "/t", "0"]).spawn().map_err(|e| e.to_string())?; }
                "restart" => { std::process::Command::new("shutdown").args(["/r", "/t", "0"]).spawn().map_err(|e| e.to_string())?; }
                _ => {}
            }
        }
        _ => {}
    }
    Ok(())
}

// -----------------------------------------------
// Clipboard history
// -----------------------------------------------

pub struct ClipboardState {
    pub history: Arc<Mutex<Vec<ClipboardEntry>>>,
}

#[tauri::command]
fn get_clipboard_history(state: tauri::State<'_, ClipboardState>) -> Vec<ClipboardEntry> {
    state.history.lock().unwrap().clone()
}

#[tauri::command]
fn set_clipboard_text(text: String) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_clipboard_image(data: String) -> Result<(), String> {
    let bytes = BASE64.decode(&data).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let image_data = arboard::ImageData {
        width: rgba.width() as usize,
        height: rgba.height() as usize,
        bytes: rgba.into_raw().into(),
    };
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_image(image_data).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_clipboard_history(state: tauri::State<'_, ClipboardState>) {
    state.history.lock().unwrap().clear();
}

/// Toggle clipboard window visibility (independent of main window)
#[tauri::command]
fn toggle_clipboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("clipboard") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
            let _ = app.emit_to("clipboard", "clipboard-refresh", ());
        }
    }
    Ok(())
}

/// Toggle json helper window visibility
#[tauri::command]
fn toggle_json_helper_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("json-helper") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Toggle totp window visibility
#[tauri::command]
fn toggle_totp_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("totp") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// -----------------------------------------------
// TOTP Token Persistence
// -----------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TotpToken {
    pub id: String,
    pub name: String,
    pub secret: String,
}

fn totp_tokens_path(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    data_dir.join("totp_tokens.json")
}

fn default_totp_tokens() -> Vec<TotpToken> {
    vec![
        TotpToken { id: "aliyun-sl".into(), name: "阿里云(石峦科技)".into(), secret: "7P5Y6KC5MCFPUXFJ".into() },
        TotpToken { id: "aliyun-hl".into(), name: "阿里云(瀚联传感)".into(), secret: "XK7UIFFXFT33WKG5Z37ASJEY4FFBH2DXDOBT52NZQBKGK7DBMIICLJW4SPX4LX75".into() },
        TotpToken { id: "manual".into(), name: "手动计算".into(), secret: "X476S24ELOBQJXESOAP5SZVM4XGTOU3KTFB5QVVZ5LOAZA6KDHXAJAGBY7HD7UQL".into() },
        TotpToken { id: "github".into(), name: "GitHub".into(), secret: "KML6IWUZ244TM6RS".into() },
        TotpToken { id: "parsec".into(), name: "Parsec".into(), secret: "QELEOOUGTDVNJPAU".into() },
    ]
}

#[tauri::command]
fn load_totp_tokens(app: tauri::AppHandle) -> Result<Vec<TotpToken>, String> {
    let path = totp_tokens_path(&app);
    if !path.exists() {
        let defaults = default_totp_tokens();
        // Persist defaults so user can manage them
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&defaults) {
            let _ = fs::write(&path, json);
        }
        return Ok(defaults);
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_totp_tokens(app: tauri::AppHandle, tokens: Vec<TotpToken>) -> Result<(), String> {
    let path = totp_tokens_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&tokens).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// -----------------------------------------------
// Clipboard Favorites
// -----------------------------------------------

pub struct ClipboardFavoritesState {
    pub favorites: Arc<Mutex<Vec<ClipboardEntry>>>,
}

#[tauri::command]
fn get_clipboard_favorites(state: tauri::State<'_, ClipboardFavoritesState>) -> Vec<ClipboardEntry> {
    state.favorites.lock().unwrap().clone()
}

#[tauri::command]
fn add_favorite(
    app: tauri::AppHandle,
    state: tauri::State<'_, ClipboardFavoritesState>,
    entry: ClipboardEntry,
) -> Result<(), String> {
    let mut favs = state.favorites.lock().unwrap();
    let id = entry.id().to_string();
    // Don't add duplicates
    let already = favs.iter().any(|e| e.id() == id);
    if !already {
        favs.insert(0, entry);
        save_clipboard_favorites(&app, &favs)?;
    }
    Ok(())
}

#[tauri::command]
fn remove_favorite(
    app: tauri::AppHandle,
    state: tauri::State<'_, ClipboardFavoritesState>,
    id: String,
) -> Result<(), String> {
    let mut favs = state.favorites.lock().unwrap();
    // Also delete image file if it's an image entry
    if let Some(entry) = favs.iter().find(|e| e.id() == id) {
        if let ClipboardEntry::Image { .. } = entry {
            let img_dir = favorites_images_dir(&app);
            let _ = fs::remove_file(img_dir.join(format!("{}.jpg", id)));
        }
    }
    favs.retain(|e| e.id() != id);
    save_clipboard_favorites(&app, &favs)
}

#[tauri::command]
fn clear_favorites(
    app: tauri::AppHandle,
    state: tauri::State<'_, ClipboardFavoritesState>,
) -> Result<(), String> {
    let mut favs = state.favorites.lock().unwrap();
    // Delete all image files
    let img_dir = favorites_images_dir(&app);
    if img_dir.exists() {
        if let Ok(entries) = fs::read_dir(&img_dir) {
            for entry in entries.flatten() {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    favs.clear();
    save_clipboard_favorites(&app, &favs)
}

/// Encode image to base64 JPEG, resize if wider than max_width
fn encode_image_jpeg(
    rgba: &RgbaImage,
    max_width: u32,
    _quality: u8,
) -> Result<(String, u32, u32), String> {
    let (w, h) = if rgba.width() > max_width {
        let ratio = max_width as f64 / rgba.width() as f64;
        (max_width, (rgba.height() as f64 * ratio) as u32)
    } else {
        (rgba.width(), rgba.height())
    };
    let resized = imageops::resize(rgba, w, h, imageops::FilterType::Triangle);
    let dynamic = DynamicImage::ImageRgba8(resized);
    let rgb_image = dynamic.to_rgb8();
    let dynamic_rgb = DynamicImage::ImageRgb8(rgb_image);
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    dynamic_rgb
        .write_to(&mut cursor, ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    let base64_str = BASE64.encode(&buf);
    Ok((base64_str, w, h))
}

// -----------------------------------------------
// App Icon Extraction (Windows)
// -----------------------------------------------

pub struct AppIconCache {
    pub icons: Arc<Mutex<HashMap<String, String>>>, // exe_path → base64 PNG
}

#[tauri::command]
fn extract_app_icons(
    state: tauri::State<'_, AppIconCache>,
    targets: Vec<String>,
) -> HashMap<String, String> {
    let mut cache = state.icons.lock().unwrap();
    let mut result = HashMap::new();
    for target in targets {
        if let Some(cached) = cache.get(&target) {
            result.insert(target.clone(), cached.clone());
            continue;
        }
        match extract_icon_from_exe(&target) {
            Some(icon_b64) => {
                cache.insert(target.clone(), icon_b64.clone());
                result.insert(target, icon_b64);
            }
            None => {
                eprintln!("[DevLauncher] icon extraction failed for: {}", target);
            }
        }
    }
    result
}

// ── Raw Win32 FFI (no external crate needed) ──

#[cfg(target_os = "windows")]
mod win32_ffi {
    #[repr(C)]
    pub struct IconInfo {
        pub f_icon: i32,
        pub x_hotspot: u32,
        pub y_hotspot: u32,
        pub hbm_mask: isize,
        pub hbm_color: isize,
    }

    #[repr(C)]
    pub struct BitmapInfoHeader {
        pub bi_size: u32,
        pub bi_width: i32,
        pub bi_height: i32,
        pub bi_planes: u16,
        pub bi_bit_count: u16,
        pub bi_compression: u32,
        pub bi_size_image: u32,
        pub bi_x_pels_per_meter: i32,
        pub bi_y_pels_per_meter: i32,
        pub bi_clr_used: u32,
        pub bi_clr_important: u32,
    }

    #[link(name = "user32")]
    extern "system" {
        pub fn ExtractIconExW(
            sz_file_name: *const u16,
            n_icon_index: i32,
            ph_icon_large: *mut isize,
            ph_icon_small: *mut isize,
            n_icons: u32,
        ) -> u32;
        pub fn DestroyIcon(h_icon: isize) -> i32;
        pub fn GetIconInfo(h_icon: isize, p_icon_info: *mut IconInfo) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        pub fn CreateCompatibleDC(hdc: isize) -> isize;
        pub fn DeleteDC(hdc: isize) -> i32;
        pub fn DeleteObject(ho: isize) -> i32;
        pub fn GetDIBits(
            hdc: isize,
            hbm: isize,
            start: u32,
            c_lines: u32,
            lpv_bits: *mut u8,
            lp_bi: *mut BitmapInfoHeader,
            usage: u32,
        ) -> i32;
    }
}

#[cfg(target_os = "windows")]
fn extract_icon_from_exe(exe_path: &str) -> Option<String> {
    unsafe {
        let wide: Vec<u16> = exe_path.encode_utf16().chain(std::iter::once(0)).collect();

        let mut hicon_large: isize = 0;
        let mut hicon_small: isize = 0;

        let count = win32_ffi::ExtractIconExW(
            wide.as_ptr(),
            0,
            &mut hicon_large,
            &mut hicon_small,
            1,
        );

        if count == 0 {
            return None;
        }

        // Prefer large icon (typically 32x32), fallback to small (16x16)
        let hicon = if hicon_large != 0 { hicon_large } else { hicon_small };
        if hicon == 0 {
            return None;
        }

        let result = hicon_to_png(hicon);

        if hicon_large != 0 {
            win32_ffi::DestroyIcon(hicon_large);
        }
        if hicon_small != 0 {
            win32_ffi::DestroyIcon(hicon_small);
        }

        result
    }
}

#[cfg(target_os = "windows")]
unsafe fn hicon_to_png(hicon: isize) -> Option<String> {
    let mut icon_info: win32_ffi::IconInfo = std::mem::zeroed();
    if win32_ffi::GetIconInfo(hicon, &mut icon_info) == 0 {
        return None;
    }

    // Guard: hbm_color can be 0 for monochrome icons
    if icon_info.hbm_color == 0 {
        if icon_info.hbm_mask != 0 { win32_ffi::DeleteObject(icon_info.hbm_mask); }
        return None;
    }

    let hdc = win32_ffi::CreateCompatibleDC(0);
    if hdc == 0 {
        return None;
    }

    // Get bitmap dimensions first
    let mut bmi: win32_ffi::BitmapInfoHeader = std::mem::zeroed();
    bmi.bi_size = std::mem::size_of::<win32_ffi::BitmapInfoHeader>() as u32;

    // First call: query dimensions
    win32_ffi::GetDIBits(
        hdc,
        icon_info.hbm_color,
        0,
        0,
        std::ptr::null_mut(),
        &mut bmi,
        0, // DIB_RGB_COLORS
    );

    let width = bmi.bi_width.unsigned_abs() as u32;
    let height = bmi.bi_height.unsigned_abs() as u32;

    if width == 0 || height == 0 || width > 512 || height > 512 {
        win32_ffi::DeleteDC(hdc);
        win32_ffi::DeleteObject(icon_info.hbm_color);
        win32_ffi::DeleteObject(icon_info.hbm_mask);
        return None;
    }

    // Second call: get actual pixels (top-down DIB)
    bmi.bi_height = -(height as i32); // negative = top-down
    bmi.bi_bit_count = 32;
    bmi.bi_compression = 0; // BI_RGB

    let mut pixels = vec![0u8; (width * height * 4) as usize];

    let scan_lines = win32_ffi::GetDIBits(
        hdc,
        icon_info.hbm_color,
        0,
        height,
        pixels.as_mut_ptr(),
        &mut bmi,
        0, // DIB_RGB_COLORS
    );

    win32_ffi::DeleteDC(hdc);
    win32_ffi::DeleteObject(icon_info.hbm_color);
    win32_ffi::DeleteObject(icon_info.hbm_mask);

    if scan_lines == 0 {
        return None;
    }

    // Convert BGRA → RGBA and un-premultiply alpha
    for chunk in pixels.chunks_exact_mut(4) {
        let b = chunk[0];
        let g = chunk[1];
        let r = chunk[2];
        let a = chunk[3];

        chunk[0] = r; // R
        chunk[1] = g; // G
        chunk[2] = b; // B
        chunk[3] = a; // A

        // Un-premultiply alpha
        let a_u32 = a as u32;
        if a_u32 > 0 && a_u32 < 255 {
            chunk[0] = ((chunk[0] as u32 * 255 + a_u32 / 2) / a_u32).min(255) as u8;
            chunk[1] = ((chunk[1] as u32 * 255 + a_u32 / 2) / a_u32).min(255) as u8;
            chunk[2] = ((chunk[2] as u32 * 255 + a_u32 / 2) / a_u32).min(255) as u8;
        }

        // If alpha is 0 but there are color values, make opaque
        if chunk[3] == 0 && (chunk[0] > 0 || chunk[1] > 0 || chunk[2] > 0) {
            chunk[3] = 255;
        }
    }

    // Resize to 32x32 for consistent display, encode as PNG
    if let Some(rgba_image) = RgbaImage::from_raw(width, height, pixels) {
        let resized = imageops::resize(&rgba_image, 32, 32, imageops::FilterType::Lanczos3);
        let dynamic = DynamicImage::ImageRgba8(resized);
        let mut png_buf = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png_buf);
        if dynamic.write_to(&mut cursor, ImageFormat::Png).is_ok() {
            return Some(BASE64.encode(&png_buf));
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn extract_icon_from_exe(_exe_path: &str) -> Option<String> {
    None
}

// -----------------------------------------------
// Remote Desktop — Data Structures & State
// -----------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteDeskProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_password: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
pub struct HostInfo {
    pub pin: String,
    pub local_ip: String,
    pub port: u16,
}

#[derive(Debug, Serialize, Clone)]
pub struct HostStatus {
    pub running: bool,
    pub connections: u32,
    pub pin: Option<String>,
}

/// Shared host-mode state (None = stopped)
struct RemoteDeskHostState {
    // shutdown signal sender; Some = running, None = stopped
    stop_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    pin: Arc<Mutex<Option<String>>>,
    connections: Arc<std::sync::atomic::AtomicU32>,
}

fn remotedesk_profiles_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("remotedesk_profiles.json")
}

// -----------------------------------------------
// Remote Desktop — Tauri Commands
// -----------------------------------------------

/// Toggle the remotedesk window visibility
#[tauri::command]
fn toggle_remotedesk_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("remotedesk") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn load_remotedesk_profiles(app: tauri::AppHandle) -> Result<Vec<RemoteDeskProfile>, String> {
    let path = remotedesk_profiles_path(&app);
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_remotedesk_profiles(app: tauri::AppHandle, profiles: Vec<RemoteDeskProfile>) -> Result<(), String> {
    let path = remotedesk_profiles_path(&app);
    if let Some(p) = path.parent() { let _ = fs::create_dir_all(p); }
    let data = serde_json::to_string_pretty(&profiles).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_remotedesk_password(id: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new("devlauncher-remotedesk", &id)
        .map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_remotedesk_password(id: String) -> Result<(), String> {
    let entry = keyring::Entry::new("devlauncher-remotedesk", &id)
        .map_err(|e| e.to_string())?;
    let _ = entry.delete_credential();
    Ok(())
}

/// Launch RDP via mstsc. Pre-stores credentials with cmdkey if password exists.
#[tauri::command]
fn launch_rdp(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let profiles = load_remotedesk_profiles(app.clone())?;
    let profile = profiles.iter().find(|p| p.id == id)
        .ok_or_else(|| format!("Profile '{}' not found", id))?
        .clone();

    let host_port = format!("{}:{}", profile.host, profile.port);

    // If password is stored, pre-register credentials with cmdkey
    if profile.has_password.unwrap_or(false) {
        let entry = keyring::Entry::new("devlauncher-remotedesk", &id)
            .map_err(|e| e.to_string())?;
        if let Ok(password) = entry.get_password() {
            let _ = std::process::Command::new("cmdkey")
                .args([
                    &format!("/add:{}", host_port),
                    &format!("/user:{}", profile.username),
                    &format!("/pass:{}", password),
                ])
                .output();
        }
    }

    std::process::Command::new("mstsc")
        .arg(format!("/v:{}", host_port))
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get local LAN IP (first non-loopback IPv4)
fn local_ip() -> String {
    // Simple approach: connect UDP to 8.8.8.8 and read the local addr
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

fn move_remote_mouse(enigo: &mut enigo::Enigo, x: i32, y: i32) {
    #[cfg(windows)]
    {
        let ok = unsafe { windows_sys::Win32::UI::WindowsAndMessaging::SetCursorPos(x, y) };
        if ok != 0 {
            return;
        }
        eprintln!("[remotedesk] SetCursorPos failed, falling back to enigo");
    }

    use enigo::Mouse;
    let _ = enigo.move_mouse(x, y, enigo::Coordinate::Abs);
}

/// Start host mode: capture screen and broadcast JPEG frames over WebSocket
#[tauri::command]
async fn start_remotedesk_host(
    app: tauri::AppHandle,
    port: Option<u16>,
) -> Result<HostInfo, String> {
    let state = app.state::<RemoteDeskHostState>();

    // Stop any existing host
    {
        let mut tx_guard = state.stop_tx.lock().unwrap();
        if let Some(tx) = tx_guard.take() {
            let _ = tx.send(());
        }
    }

    let ws_port = port.unwrap_or(19090);
    let pin: String = {
        let mut rng = rand::thread_rng();
        format!("{:06}", rng.gen_range(0..1_000_000))
    };
    let local = local_ip();

    *state.pin.lock().unwrap() = Some(pin.clone());
    state.connections.store(0, std::sync::atomic::Ordering::Relaxed);

    let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();
    *state.stop_tx.lock().unwrap() = Some(stop_tx);

    let pin_clone = pin.clone();
    let conn_count = Arc::clone(&state.connections);

    // Get primary screen dimensions before spawning (needed for mouse coordinate mapping)
    let (screen_x, screen_y, screen_w, screen_h) = {
        use screenshots::Screen;
        Screen::all().ok()
            .and_then(|all| {
                let idx = all.iter().position(|s| s.display_info.is_primary).unwrap_or(0);
                all.into_iter().nth(idx).map(|s| (
                    s.display_info.x,
                    s.display_info.y,
                    s.display_info.width,
                    s.display_info.height,
                ))
            })
            .unwrap_or((0, 0, 1920, 1080))
    };

    // Spawn tokio task for the WebSocket server
    tokio::spawn(async move {
        use tokio::net::TcpListener;
        use tokio_tungstenite::tungstenite::protocol::Message;

        let addr = format!("0.0.0.0:{}", ws_port);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[remotedesk] bind failed: {}", e);
                return;
            }
        };

        // Shared frame broadcaster
        let (frame_tx, _) = tokio::sync::broadcast::channel::<Vec<u8>>(4);
        let frame_tx = Arc::new(frame_tx);
        let capture_running = Arc::new(AtomicBool::new(true));

        // Dedicated input thread with persistent Enigo instance
        // (Enigo init is expensive on Windows; reuse one instance per thread)
        let (input_tx, input_rx) = std::sync::mpsc::channel::<String>();
        std::thread::spawn(move || {
            use enigo::{Enigo, Mouse, Settings, Button};
            let mut enigo = match Enigo::new(&Settings::default()) {
                Ok(e) => e,
                Err(e) => { eprintln!("[remotedesk] enigo init failed: {}", e); return; }
            };
            let max_rel_x = screen_w.saturating_sub(1) as i32;
            let max_rel_y = screen_h.saturating_sub(1) as i32;
            let mut debug_count = 0u32;
            for msg in input_rx {
                let v: serde_json::Value = match serde_json::from_str(&msg) {
                    Ok(v) => v, Err(_) => continue,
                };
                let kind = v["type"].as_str().unwrap_or("");
                let rel_x = (v["x"].as_i64().unwrap_or(0) as i32).clamp(0, max_rel_x);
                let rel_y = (v["y"].as_i64().unwrap_or(0) as i32).clamp(0, max_rel_y);
                let x = screen_x + rel_x;
                let y = screen_y + rel_y;
                let btn_idx = v["button"].as_i64().unwrap_or(0);
                let button = match btn_idx { 2 => Button::Right, 1 => Button::Middle, _ => Button::Left };
                if debug_count < 20 || kind != "mousemove" {
                    eprintln!(
                        "[remotedesk input] kind={} rel=({}, {}) abs=({}, {}) screen_origin=({}, {}) button={}",
                        kind, rel_x, rel_y, x, y, screen_x, screen_y, btn_idx,
                    );
                    debug_count += 1;
                }
                match kind {
                    "mousemove" => { move_remote_mouse(&mut enigo, x, y); }
                    "mousedown" => {
                        move_remote_mouse(&mut enigo, x, y);
                        let _ = enigo.button(button, enigo::Direction::Press);
                    }
                    "mouseup" => {
                        move_remote_mouse(&mut enigo, x, y);
                        let _ = enigo.button(button, enigo::Direction::Release);
                    }
                    _ => {}
                }
            }
        });
        let input_tx = Arc::new(input_tx);

        // Screen capture thread → sends JPEG frames to broadcast channel
        // Uses screenshots crate (GDI/BitBlt) — more compatible than scrap (DXGI)
        {
            let frame_tx = Arc::clone(&frame_tx);
            let capture_running = Arc::clone(&capture_running);
            std::thread::spawn(move || {
                use screenshots::Screen;

                let screen = {
                    let all = match Screen::all() {
                        Ok(s) => s,
                        Err(e) => { eprintln!("[remotedesk] screen list error: {}", e); return; }
                    };
                    if all.is_empty() { eprintln!("[remotedesk] no screens found"); return; }
                    let idx = all.iter().position(|s| s.display_info.is_primary).unwrap_or(0);
                    all.into_iter().nth(idx).unwrap()
                };

                let interval = std::time::Duration::from_millis(50); // ~20fps target
                while capture_running.load(Ordering::Relaxed) {
                    std::thread::sleep(interval);
                    if frame_tx.receiver_count() == 0 {
                        continue;
                    }
                    let captured = match screen.capture() {
                        Ok(img) => img,
                        Err(e) => { eprintln!("[remotedesk] frame error: {}", e); break; }
                    };
                    let w = captured.width();
                    let h = captured.height();
                    // screenshots uses image v0.24; extract raw bytes and rebuild with our image v0.25
                    let raw: Vec<u8> = captured.into_raw();
                    let dyn_img = match RgbaImage::from_raw(w, h, raw) {
                        Some(img) => DynamicImage::ImageRgba8(img),
                        None => continue,
                    };
                    // Keep enough pixels for fullscreen viewing while still capping very large screens.
                    let scaled = if w > 1920 {
                        dyn_img.resize(1920, (h as f32 * 1920.0 / w as f32) as u32,
                            imageops::FilterType::Triangle)
                    } else { dyn_img };
                    let mut buf = std::io::Cursor::new(Vec::new());
                    {
                        use image::codecs::jpeg::JpegEncoder;
                        let mut enc = JpegEncoder::new_with_quality(&mut buf, 70);
                        if enc.encode_image(&scaled).is_err() { continue; }
                    }
                    let _ = frame_tx.send(buf.into_inner());
                }
            });
        }

        let mut stop_rx = stop_rx;
        loop {
            tokio::select! {
            _ = &mut stop_rx => break,
                result = listener.accept() => {
                    match result {
                        Ok((stream, _)) => {
                            let pin_expected = pin_clone.clone();
                            let mut rx = frame_tx.subscribe();
                            let conn_count = Arc::clone(&conn_count);
                            let input_tx = Arc::clone(&input_tx);
                            tokio::spawn(async move {
                                let ws_stream = match tokio_tungstenite::accept_async(stream).await {
                                    Ok(ws) => ws,
                                    Err(_) => return,
                                };
                                let (mut sender, mut receiver) = ws_stream.split();

                                // Handshake: expect {"pin":"xxxxxx"}
                                let auth = tokio::time::timeout(
                                    std::time::Duration::from_secs(10),
                                    receiver.next()
                                ).await;
                                let authed = match auth {
                                    Ok(Some(Ok(Message::Text(txt)))) => {
                                        let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or_default();
                                        v["pin"].as_str().unwrap_or("") == pin_expected
                                    }
                                    _ => false,
                                };
                                if !authed {
                                    let _ = sender.send(Message::Text("{\"error\":\"invalid_pin\"}".to_string().into())).await;
                                    return;
                                }
                                // Include real screen dimensions so client can map mouse coords correctly
                                let ok_msg = format!("{{\"ok\":true,\"screen_x\":{},\"screen_y\":{},\"screen_w\":{},\"screen_h\":{}}}", screen_x, screen_y, screen_w, screen_h);
                                let _ = sender.send(Message::Text(ok_msg.into())).await;
                                conn_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

                                // Receive input independently so slow frame sends do not block mouse movement.
                                let mut input_task = {
                                    let input_tx = Arc::clone(&input_tx);
                                    tokio::spawn(async move {
                                        while let Some(msg) = receiver.next().await {
                                            match msg {
                                                Ok(Message::Text(txt)) => {
                                                    let _ = input_tx.send(txt.to_string());
                                                }
                                                Ok(Message::Close(_)) | Err(_) => break,
                                                _ => {}
                                            }
                                        }
                                    })
                                };

                                // Stream frames to the client.
                                loop {
                                    tokio::select! {
                                        _ = &mut input_task => break,
                                        frame_result = rx.recv() => {
                                            match frame_result {
                                                Ok(jpeg_bytes) => {
                                                    let sent = tokio::time::timeout(
                                                        std::time::Duration::from_millis(1500),
                                                        sender.send(Message::Binary(jpeg_bytes.into())),
                                                    ).await;
                                                    if !matches!(sent, Ok(Ok(_))) {
                                                        break;
                                                    }
                                                }
                                                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                                                Err(_) => break,
                                            }
                                        }
                                    }
                                }
                                input_task.abort();
                                conn_count.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
                            });
                        }
                        Err(e) => eprintln!("[remotedesk] accept error: {}", e),
                    }
                }
            }
        }
        capture_running.store(false, Ordering::Relaxed);
    });

    Ok(HostInfo { pin, local_ip: local, port: ws_port })
}

#[tauri::command]
fn stop_remotedesk_host(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<RemoteDeskHostState>();
    if let Some(tx) = state.stop_tx.lock().unwrap().take() {
        let _ = tx.send(());
    }
    *state.pin.lock().unwrap() = None;
    state.connections.store(0, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn get_remotedesk_host_status(app: tauri::AppHandle) -> HostStatus {
    let state = app.state::<RemoteDeskHostState>();
    let pin = state.pin.lock().unwrap().clone();
    let running = pin.is_some();
    let connections = state.connections.load(std::sync::atomic::Ordering::Relaxed);
    HostStatus { running, connections, pin }
}

// -----------------------------------------------
// frp (fast reverse proxy) — auto-launch frpc
// -----------------------------------------------

struct FrpState {
    child: Arc<Mutex<Option<std::process::Child>>>,
}

#[derive(Debug, Serialize)]
pub struct FrpStatus {
    pub running: bool,
}

/// Write frpc.ini to %TEMP% and spawn frpc process
#[tauri::command]
fn start_frp(
    app: tauri::AppHandle,
    frpc_path: String,
    vps_ip: String,
    vps_server_port: u16,
    remote_port: u16,
    local_port: u16,
) -> Result<(), String> {
    // Stop any running frp first
    {
        let state = app.state::<FrpState>();
        let mut guard = state.child.lock().unwrap();
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }

    let config = format!(
        "[common]\nserver_addr = {}\nserver_port = {}\n\n[remotedesk-ws]\ntype = tcp\nlocal_ip = 127.0.0.1\nlocal_port = {}\nremote_port = {}\n",
        vps_ip, vps_server_port, local_port, remote_port
    );

    let config_path = std::env::temp_dir().join("devlauncher_frpc.ini");
    fs::write(&config_path, config).map_err(|e| format!("写入 frpc.ini 失败: {}", e))?;

    let child = std::process::Command::new(&frpc_path)
        .args(["-c", config_path.to_str().unwrap_or("")])
        .spawn()
        .map_err(|e| format!("frpc 启动失败: {} (路径: {})", e, frpc_path))?;

    *app.state::<FrpState>().child.lock().unwrap() = Some(child);
    Ok(())
}

#[tauri::command]
fn stop_frp(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<FrpState>();
    let mut guard = state.child.lock().unwrap();
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_frp_status(app: tauri::AppHandle) -> FrpStatus {
    let state = app.state::<FrpState>();
    let mut guard = state.child.lock().unwrap();
    let running = if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(None) => true,  // still running
            _ => { *guard = None; false }
        }
    } else {
        false
    };
    FrpStatus { running }
}

// -----------------------------------------------
// ngrok — auto-tunnel (no VPS needed)
// -----------------------------------------------

struct NgrokState {
    child: Arc<Mutex<Option<std::process::Child>>>,
    public_addr: Arc<Mutex<Option<String>>>,
    error: Arc<Mutex<Option<String>>>,
}

#[derive(Debug, Serialize)]
pub struct NgrokStatus {
    pub running: bool,
    pub public_addr: Option<String>,
    pub error: Option<String>,
}

/// Spawn ngrok and poll its local API until the public address is assigned.
#[tauri::command]
fn start_ngrok(app: tauri::AppHandle, local_port: u16) -> Result<(), String> {
    let state = app.state::<NgrokState>();
    {
        let mut guard = state.child.lock().unwrap();
        if let Some(mut child) = guard.take() { let _ = child.kill(); }
        *state.public_addr.lock().unwrap() = None;
        *state.error.lock().unwrap() = None;
    }

    let ngrok_candidates = [
        "ngrok",
        r"C:\ngrok\ngrok.exe",
        r"C:\tools\ngrok.exe",
        r"C:\Users\Public\ngrok.exe",
    ];
    let ngrok_exe = ngrok_candidates.iter()
        .find(|&&p| std::process::Command::new(p).arg("version").output()
            .map(|o| o.status.success()).unwrap_or(false))
        .copied()
        .ok_or("ngrok 未找到，请先下载 ngrok.exe 并加入 PATH 或放到 C:\\ngrok\\ 目录")?;

    // Capture stderr so we can read error messages when ngrok exits
    // Clear proxy env vars — ngrok free tier does not support proxies (ERR_NGROK_9009)
    // Use "http" tunnel — free accounts cannot use TCP without a credit card on file
    let child = std::process::Command::new(ngrok_exe)
        .args(["http", &local_port.to_string()])
        .env_remove("http_proxy")
        .env_remove("https_proxy")
        .env_remove("HTTP_PROXY")
        .env_remove("HTTPS_PROXY")
        .env_remove("ALL_PROXY")
        .env_remove("all_proxy")
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("ngrok 启动失败: {}", e))?;

    *state.child.lock().unwrap() = Some(child);

    let public_addr_arc = Arc::clone(&state.public_addr);
    let child_arc = Arc::clone(&state.child);
    let error_arc = Arc::clone(&state.error);

    std::thread::spawn(move || {
        for attempt in 0..40 {
            std::thread::sleep(std::time::Duration::from_millis(500));

            // Check if process exited unexpectedly
            {
                let mut guard = child_arc.lock().unwrap();
                if let Some(child) = guard.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let mut msg = format!("ngrok 已退出 (code {})", status);
                            if let Some(mut stderr) = child.stderr.take() {
                                use std::io::Read;
                                let mut buf = String::new();
                                let _ = stderr.read_to_string(&mut buf);
                                if buf.contains("ERR_NGROK_4018") || buf.contains("ERR_NGROK_105")
                                    || (buf.contains("authtoken") && (buf.contains("ERR_") || buf.contains("invalid") || buf.contains("missing") || buf.contains("not set")))
                                {
                                    msg = "未配置 authtoken，请运行: ngrok config add-authtoken <token>".into();
                                } else if buf.contains("ERR_NGROK_9009") {
                                    msg = "代理冲突 (ERR_NGROK_9009)：已自动清除代理变量，请重试一次".into();
                                } else if buf.contains("already") || buf.contains("address already in use") {
                                    msg = "ngrok 已在运行，请先关闭其他 ngrok 实例".into();
                                } else {
                                    // Take the first line with actual content after "ERROR: " prefix
                                    let first_msg = buf.lines()
                                        .map(|l| l.trim_start_matches("ERROR:").trim())
                                        .find(|l| l.len() > 4)
                                        .unwrap_or("");
                                    if !first_msg.is_empty() {
                                        msg = first_msg.to_string();
                                    }
                                }
                            }
                            *error_arc.lock().unwrap() = Some(msg);
                            *guard = None;
                            return;
                        }
                        _ => {}
                    }
                } else {
                    return;
                }
            }

            // Poll ngrok local dashboard API
            match ureq::get("http://127.0.0.1:4040/api/tunnels").call() {
                Ok(resp) => {
                    if let Ok(body) = resp.into_string() {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                            if let Some(tunnels) = json["tunnels"].as_array() {
                                for t in tunnels {
                                    if let Some(url) = t["public_url"].as_str() {
                                        // Keep full URL (e.g. https://xxx.ngrok-free.app)
                                        *public_addr_arc.lock().unwrap() = Some(url.to_string());
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
                Err(ureq::Error::Status(code, resp)) if code == 401 || code == 403 => {
                    let body = resp.into_string().unwrap_or_default();
                    let msg = serde_json::from_str::<serde_json::Value>(&body).ok()
                        .and_then(|v| v["msg"].as_str().map(|s| s.to_string()))
                        .unwrap_or_else(|| "认证失败，请配置 authtoken".into());
                    *error_arc.lock().unwrap() = Some(msg);
                    return;
                }
                _ => {}
            }

            if attempt == 39 {
                *error_arc.lock().unwrap() = Some(
                    "超时：20s 内未获取到公网地址，请检查 authtoken 和网络连接".into()
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn stop_ngrok(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<NgrokState>();
    let mut guard = state.child.lock().unwrap();
    if let Some(mut child) = guard.take() { child.kill().map_err(|e| e.to_string())?; }
    *state.public_addr.lock().unwrap() = None;
    *state.error.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
fn get_ngrok_status(app: tauri::AppHandle) -> NgrokStatus {
    let state = app.state::<NgrokState>();
    let mut child_guard = state.child.lock().unwrap();
    let running = if let Some(child) = child_guard.as_mut() {
        match child.try_wait() {
            Ok(None) => true,
            _ => { *child_guard = None; false }
        }
    } else { false };
    if !running { *state.public_addr.lock().unwrap() = None; }
    let public_addr = state.public_addr.lock().unwrap().clone();
    let error = state.error.lock().unwrap().clone();
    NgrokStatus { running, public_addr, error }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance: if a second instance is launched, focus the existing window
        .plugin(tauri_plugin_single_instance::Builder::new()
            .callback(|app, _argv, _cwd| {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            })
            .build()
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            get_config_path,
            execute_action,
            get_clipboard_history,
            set_clipboard_text,
            set_clipboard_image,
            clear_clipboard_history,
            toggle_clipboard_window,
            toggle_json_helper_window,
            toggle_totp_window,
            load_totp_tokens,
            save_totp_tokens,
            get_clipboard_favorites,
            add_favorite,
            remove_favorite,
            clear_favorites,
            extract_app_icons,
            save_ssh_password,
            delete_ssh_password,
            toggle_remotedesk_window,
            load_remotedesk_profiles,
            save_remotedesk_profiles,
            save_remotedesk_password,
            delete_remotedesk_password,
            launch_rdp,
            start_remotedesk_host,
            stop_remotedesk_host,
            get_remotedesk_host_status,
            start_frp,
            stop_frp,
            get_frp_status,
            start_ngrok,
            stop_ngrok,
            get_ngrok_status,
            terminal_spawn,
            terminal_write,
            terminal_resize,
            terminal_kill,
            terminal_run,
            terminal_take_pending_cmd,
            toggle_terminal_window,
        ])
        .setup(|app| {
            // ── App icon cache ──
            let icon_cache = Arc::new(Mutex::new(HashMap::<String, String>::new()));
            app.manage(AppIconCache { icons: Arc::clone(&icon_cache) });

            // ── Remote desktop host state ──
            app.manage(RemoteDeskHostState {
                stop_tx: Arc::new(Mutex::new(None)),
                pin: Arc::new(Mutex::new(None)),
                connections: Arc::new(std::sync::atomic::AtomicU32::new(0)),
            });

            // ── frp process state ──
            app.manage(FrpState {
                child: Arc::new(Mutex::new(None)),
            });

            // ── PTY terminal state ──
            app.manage(TerminalState {
                sessions: Arc::new(Mutex::new(HashMap::new())),
                pending_cmd: Arc::new(Mutex::new(None)),
            });

            // ── ngrok state ──
            app.manage(NgrokState {
                child: Arc::new(Mutex::new(None)),
                public_addr: Arc::new(Mutex::new(None)),
                error: Arc::new(Mutex::new(None)),
            });

            // ── Load persisted favorites ──
            let favorites: Vec<ClipboardEntry> = load_clipboard_favorites(app.handle()).unwrap_or_default();
            let fav_arc = Arc::new(Mutex::new(favorites));
            app.manage(ClipboardFavoritesState { favorites: Arc::clone(&fav_arc) });

            // ── Clipboard history polling (text + image) ──
            let history = Arc::new(Mutex::new(Vec::<ClipboardEntry>::new()));
            app.manage(ClipboardState { history: Arc::clone(&history) });
            {
                let history = Arc::clone(&history);
                std::thread::spawn(move || {
                    if let Ok(mut cb) = arboard::Clipboard::new() {
                        let mut last_text = String::new();
                        let mut last_image_fp: Vec<u8> = Vec::new();
                        loop {
                            // Poll text
                            if let Ok(text) = cb.get_text() {
                                let t = text.trim().to_string();
                                if !t.is_empty() && t != last_text {
                                    last_text = t.clone();
                                    let mut hist = history.lock().unwrap();
                                    hist.retain(|e| !matches!(e, ClipboardEntry::Text { content, .. } if content == &t));
                                    hist.insert(0, ClipboardEntry::Text { id: generate_id(), content: t });
                                    if hist.len() > 30 { hist.truncate(30); }
                                }
                            }
                            // Poll image
                            if let Ok(image) = cb.get_image() {
                                if image.width >= 16 && image.height >= 16 {
                                    let mut fp = Vec::new();
                                    fp.extend_from_slice(&image.width.to_le_bytes());
                                    fp.extend_from_slice(&image.height.to_le_bytes());
                                    if image.bytes.len() > 64 {
                                        fp.extend_from_slice(&image.bytes[..64]);
                                    } else {
                                        fp.extend_from_slice(&image.bytes);
                                    }
                                    if fp != last_image_fp {
                                        last_image_fp = fp;
                                        if let Some(rgba) = RgbaImage::from_raw(
                                            image.width as u32,
                                            image.height as u32,
                                            image.bytes.as_ref().to_vec(),
                                        ) {
                                            if let Ok((data, w, h)) = encode_image_jpeg(&rgba, 1920, 85) {
                                                let mut hist = history.lock().unwrap();
                                                hist.insert(0, ClipboardEntry::Image { id: generate_id(), data, width: w, height: h });
                                                if hist.len() > 20 { hist.truncate(20); }
                                            }
                                        }
                                    }
                                }
                            }
                            std::thread::sleep(std::time::Duration::from_millis(600));
                        }
                    }
                });
            }
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DevLauncher")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
