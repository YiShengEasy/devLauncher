use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::RgbaImage;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};

use crate::types::{generate_id, ClipboardEntry};
use crate::utils::image::encode_image_jpeg;
use crate::window_pinning;

// -----------------------------------------------
// Favorites persistence helpers
// -----------------------------------------------

pub(crate) fn favorites_path(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    data_dir.join("clipboard_favorites.json")
}

pub(crate) fn favorites_images_dir(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    data_dir.join("clipboard_images")
}

pub(crate) fn save_clipboard_favorites(
    app: &tauri::AppHandle,
    favorites: &[ClipboardEntry],
) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let img_dir = dir.join("clipboard_images");
    fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;

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

pub fn load_clipboard_favorites(app: &tauri::AppHandle) -> Result<Vec<ClipboardEntry>, String> {
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

    Ok(values
        .iter()
        .filter_map(|v| {
            let kind = v["kind"].as_str().unwrap_or("");
            match kind {
                "text" => Some(ClipboardEntry::Text {
                    id: v["id"].as_str().unwrap_or("").to_string(),
                    content: v["content"].as_str().unwrap_or("").to_string(),
                }),
                "image" => {
                    let id = v["id"].as_str().unwrap_or("").to_string();
                    let file = v["file"].as_str().unwrap_or("");
                    let img_path = img_dir.join(file);
                    if !img_path.exists() {
                        return None;
                    }
                    let bytes = fs::read(&img_path).ok()?;
                    let data = BASE64.encode(&bytes);
                    Some(ClipboardEntry::Image {
                        id,
                        data,
                        width: v["width"].as_u64().unwrap_or(0) as u32,
                        height: v["height"].as_u64().unwrap_or(0) as u32,
                    })
                }
                _ => None,
            }
        })
        .collect())
}

// -----------------------------------------------
// State
// -----------------------------------------------

pub struct ClipboardState {
    pub history: Arc<Mutex<Vec<ClipboardEntry>>>,
    pub suppressed_text: Arc<Mutex<Option<String>>>,
    pub suppressed_image_fp: Arc<Mutex<Option<Vec<u8>>>>,
}

pub struct ClipboardFavoritesState {
    pub favorites: Arc<Mutex<Vec<ClipboardEntry>>>,
}

fn apply_pin_state(app: &tauri::AppHandle, label: &str) {
    let _ = window_pinning::apply_window_pin_state(app, label);
}

const CLIPBOARD_DOCK_HEIGHT: u32 = 620;
const CLIPBOARD_DOCK_BOTTOM_MARGIN: i32 = 0;

fn image_fingerprint(width: usize, height: usize, bytes: &[u8]) -> Vec<u8> {
    let mut fp = Vec::new();
    fp.extend_from_slice(&width.to_le_bytes());
    fp.extend_from_slice(&height.to_le_bytes());
    if bytes.len() > 64 {
        fp.extend_from_slice(&bytes[..64]);
    } else {
        fp.extend_from_slice(bytes);
    }
    fp
}

fn should_suppress_text(suppressed: &Arc<Mutex<Option<String>>>, text: &str) -> bool {
    let mut pending = suppressed.lock().unwrap();
    if pending.as_deref() == Some(text) {
        *pending = None;
        return true;
    }
    false
}

fn should_suppress_image(suppressed: &Arc<Mutex<Option<Vec<u8>>>>, fp: &[u8]) -> bool {
    let mut pending = suppressed.lock().unwrap();
    if pending.as_deref() == Some(fp) {
        *pending = None;
        return true;
    }
    false
}

fn bottom_dock_position(
    work_area_position: PhysicalPosition<i32>,
    work_area_size: PhysicalSize<u32>,
    window_size: PhysicalSize<u32>,
    bottom_margin: i32,
) -> PhysicalPosition<i32> {
    let x = work_area_position.x
        + ((work_area_size.width as i32 - window_size.width as i32) / 2).max(0);
    let y = work_area_position.y + work_area_size.height as i32
        - window_size.height as i32
        - bottom_margin;
    PhysicalPosition::new(x, y.max(work_area_position.y))
}

fn position_clipboard_dock(
    app: &tauri::AppHandle,
    win: &tauri::WebviewWindow,
) -> Result<(), String> {
    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let area = monitor.work_area();
    let window_size = PhysicalSize::new(area.size.width, CLIPBOARD_DOCK_HEIGHT);
    let position = bottom_dock_position(
        area.position,
        area.size,
        window_size,
        CLIPBOARD_DOCK_BOTTOM_MARGIN,
    );
    win.set_size(window_size).map_err(|e| e.to_string())?;
    win.set_position(position).map_err(|e| e.to_string())
}

// -----------------------------------------------
// Setup: manage state + spawn polling thread
// -----------------------------------------------

pub fn setup(app: &mut tauri::App) {
    let favorites: Vec<ClipboardEntry> = load_clipboard_favorites(app.handle()).unwrap_or_default();
    let fav_arc = Arc::new(Mutex::new(favorites));
    app.manage(ClipboardFavoritesState {
        favorites: Arc::clone(&fav_arc),
    });

    let history = Arc::new(Mutex::new(Vec::<ClipboardEntry>::new()));
    let suppressed_text = Arc::new(Mutex::new(None::<String>));
    let suppressed_image_fp = Arc::new(Mutex::new(None::<Vec<u8>>));
    app.manage(ClipboardState {
        history: Arc::clone(&history),
        suppressed_text: Arc::clone(&suppressed_text),
        suppressed_image_fp: Arc::clone(&suppressed_image_fp),
    });

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
                        if should_suppress_text(&suppressed_text, &t) {
                            continue;
                        }
                        let mut hist = history.lock().unwrap();
                        hist.retain(
                            |e| !matches!(e, ClipboardEntry::Text { content, .. } if content == &t),
                        );
                        hist.insert(
                            0,
                            ClipboardEntry::Text {
                                id: generate_id(),
                                content: t,
                            },
                        );
                        if hist.len() > 30 {
                            hist.truncate(30);
                        }
                    }
                }
                // Poll image
                if let Ok(image) = cb.get_image() {
                    if image.width >= 16 && image.height >= 16 {
                        let fp = image_fingerprint(image.width, image.height, image.bytes.as_ref());
                        if fp != last_image_fp {
                            last_image_fp = fp.clone();
                            if should_suppress_image(&suppressed_image_fp, &fp) {
                                continue;
                            }
                            if let Some(rgba) = RgbaImage::from_raw(
                                image.width as u32,
                                image.height as u32,
                                image.bytes.as_ref().to_vec(),
                            ) {
                                if let Ok((data, w, h)) = encode_image_jpeg(&rgba, 1920, 85) {
                                    let mut hist = history.lock().unwrap();
                                    hist.insert(
                                        0,
                                        ClipboardEntry::Image {
                                            id: generate_id(),
                                            data,
                                            width: w,
                                            height: h,
                                        },
                                    );
                                    if hist.len() > 20 {
                                        hist.truncate(20);
                                    }
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

// -----------------------------------------------
// Commands
// -----------------------------------------------

#[tauri::command]
pub fn get_clipboard_history(state: tauri::State<'_, ClipboardState>) -> Vec<ClipboardEntry> {
    state.history.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_clipboard_text(
    state: tauri::State<'_, ClipboardState>,
    text: String,
    suppress_history: Option<bool>,
) -> Result<(), String> {
    let normalized = text.trim().to_string();
    if suppress_history.unwrap_or(false) && !normalized.is_empty() {
        *state.suppressed_text.lock().unwrap() = Some(normalized);
    }
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.get_text().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_clipboard_image(
    state: tauri::State<'_, ClipboardState>,
    data: String,
    suppress_history: Option<bool>,
) -> Result<(), String> {
    let bytes = BASE64.decode(&data).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let width = rgba.width() as usize;
    let height = rgba.height() as usize;
    let raw = rgba.into_raw();
    if suppress_history.unwrap_or(false) {
        *state.suppressed_image_fp.lock().unwrap() = Some(image_fingerprint(width, height, &raw));
    }
    set_clipboard_image_data(width, height, raw)
}

#[cfg(target_os = "windows")]
fn set_clipboard_image_data(width: usize, height: usize, raw: Vec<u8>) -> Result<(), String> {
    let mut last_error = None;
    for _ in 0..5 {
        match arboard::Clipboard::new().and_then(|mut clipboard| {
            clipboard.set_image(arboard::ImageData {
                width,
                height,
                bytes: raw.clone().into(),
            })
        }) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error.to_string());
                std::thread::sleep(std::time::Duration::from_millis(40));
            }
        }
    }
    Err(last_error.unwrap_or_else(|| "clipboard image write failed".to_string()))
}

#[cfg(not(target_os = "windows"))]
fn set_clipboard_image_data(width: usize, height: usize, raw: Vec<u8>) -> Result<(), String> {
    let image_data = arboard::ImageData {
        width,
        height,
        bytes: raw.into(),
    };
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_image(image_data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_clipboard_history(state: tauri::State<'_, ClipboardState>) {
    state.history.lock().unwrap().clear();
}

#[tauri::command]
pub fn toggle_clipboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("clipboard") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            apply_pin_state(&app, "clipboard");
            position_clipboard_dock(&app, &win)?;
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
            let _ = app.emit_to("clipboard", "clipboard-refresh", ());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_clipboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("clipboard") {
        apply_pin_state(&app, "clipboard");
        position_clipboard_dock(&app, &win)?;
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        let _ = app.emit_to("clipboard", "clipboard-refresh", ());
    }
    Ok(())
}

#[tauri::command]
pub fn get_clipboard_favorites(
    state: tauri::State<'_, ClipboardFavoritesState>,
) -> Vec<ClipboardEntry> {
    state.favorites.lock().unwrap().clone()
}

#[tauri::command]
pub fn add_favorite(
    app: tauri::AppHandle,
    state: tauri::State<'_, ClipboardFavoritesState>,
    entry: ClipboardEntry,
) -> Result<(), String> {
    let mut favs = state.favorites.lock().unwrap();
    let id = entry.id().to_string();
    let already = favs.iter().any(|e| e.id() == id);
    if !already {
        favs.insert(0, entry);
        save_clipboard_favorites(&app, &favs)?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_favorite(
    app: tauri::AppHandle,
    state: tauri::State<'_, ClipboardFavoritesState>,
    id: String,
) -> Result<(), String> {
    let mut favs = state.favorites.lock().unwrap();
    if let Some(entry) = favs.iter().find(|e| e.id() == id) {
        if let ClipboardEntry::Image { .. } = entry {
            let img_dir = favorites_images_dir(&app);
            let _ = fs::remove_file(img_dir.join(format!("{}.jpg", id)));
        }
    }
    favs.retain(|e| e.id() != id);
    save_clipboard_favorites(&app, &favs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bottom_dock_position_centers_window_and_uses_bottom_margin() {
        let pos = bottom_dock_position(
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1440, 900),
            PhysicalSize::new(1440, 620),
            0,
        );

        assert_eq!(pos.x, 0);
        assert_eq!(pos.y, 280);
    }

    #[test]
    fn bottom_dock_position_clamps_y_to_work_area_top_on_short_screen() {
        let pos = bottom_dock_position(
            PhysicalPosition::new(10, 40),
            PhysicalSize::new(800, 220),
            PhysicalSize::new(800, 620),
            0,
        );

        assert_eq!(pos.x, 10);
        assert_eq!(pos.y, 40);
    }

    #[test]
    fn suppress_text_consumes_matching_value_once() {
        let suppressed = Arc::new(Mutex::new(Some("hello".to_string())));

        assert!(should_suppress_text(&suppressed, "hello"));
        assert!(!should_suppress_text(&suppressed, "hello"));
    }

    #[test]
    fn suppress_image_consumes_matching_fingerprint_once() {
        let fp = image_fingerprint(2, 2, &[1, 2, 3, 4]);
        let suppressed = Arc::new(Mutex::new(Some(fp.clone())));

        assert!(should_suppress_image(&suppressed, &fp));
        assert!(!should_suppress_image(&suppressed, &fp));
    }

    #[test]
    fn suppress_image_ignores_different_fingerprint() {
        let suppressed = Arc::new(Mutex::new(Some(image_fingerprint(2, 2, &[1, 2, 3, 4]))));
        let other = image_fingerprint(2, 2, &[4, 3, 2, 1]);

        assert!(!should_suppress_image(&suppressed, &other));
    }
}

#[tauri::command]
pub fn clear_favorites(
    app: tauri::AppHandle,
    state: tauri::State<'_, ClipboardFavoritesState>,
) -> Result<(), String> {
    let mut favs = state.favorites.lock().unwrap();
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
