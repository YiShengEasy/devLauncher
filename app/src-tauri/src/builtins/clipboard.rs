use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::RgbaImage;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

use crate::types::{generate_id, ClipboardEntry};
use crate::utils::image::encode_image_jpeg;

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
}

pub struct ClipboardFavoritesState {
    pub favorites: Arc<Mutex<Vec<ClipboardEntry>>>,
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
    app.manage(ClipboardState {
        history: Arc::clone(&history),
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
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.get_text().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_clipboard_image(data: String) -> Result<(), String> {
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
pub fn clear_clipboard_history(state: tauri::State<'_, ClipboardState>) {
    state.history.lock().unwrap().clear();
}

#[tauri::command]
pub fn toggle_clipboard_window(app: tauri::AppHandle) -> Result<(), String> {
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

#[tauri::command]
pub fn show_clipboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("clipboard") {
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
