use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use image::{DynamicImage, ImageFormat, RgbaImage, imageops};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
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

#[tauri::command]
fn execute_action(action: serde_json::Value) -> Result<(), String> {
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
        "folder" | "file" | "url" => {
            let target = action["target"].as_str().ok_or("missing target")?;
            open::that(target).map_err(|e| e.to_string())?;
        }
        "ssh" => {
            let host = action["host"].as_str().ok_or("missing host")?;
            let user = action["user"].as_str().ok_or("missing user")?;
            let ssh_target = format!("{}@{}", user, host);
            if std::process::Command::new("wt.exe")
                .args(["ssh", &ssh_target])
                .spawn()
                .is_err()
            {
                std::process::Command::new("cmd")
                    .args(["/C", "start", "cmd", "/K", "ssh", &ssh_target])
                    .spawn()
                    .map_err(|e| e.to_string())?;
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
        TotpToken { id: "aliyun-sl".into(), name: "阿里云(石峦科技)".into(), secret: "[removed-totp-secret]".into() },
        TotpToken { id: "aliyun-hl".into(), name: "阿里云(瀚联传感)".into(), secret: "[removed-totp-secret]".into() },
        TotpToken { id: "manual".into(), name: "手动计算".into(), secret: "[removed-totp-secret]".into() },
        TotpToken { id: "github".into(), name: "GitHub".into(), secret: "[removed-totp-secret]".into() },
        TotpToken { id: "parsec".into(), name: "Parsec".into(), secret: "[removed-totp-secret]".into() },
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
        if let Some(icon_b64) = extract_icon_from_exe(&target) {
            cache.insert(target.clone(), icon_b64.clone());
            result.insert(target, icon_b64);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .setup(|app| {
            // ── App icon cache ──
            let icon_cache = Arc::new(Mutex::new(HashMap::<String, String>::new()));
            app.manage(AppIconCache { icons: Arc::clone(&icon_cache) });

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
