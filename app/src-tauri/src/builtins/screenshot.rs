use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::RgbaImage;
use std::fs;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

use crate::utils::image::encode_image_jpeg;

pub struct ScreenshotCaptureState {
    pub image_data: Arc<Mutex<Option<String>>>,
}

pub fn setup(app: &mut tauri::App) {
    app.manage(ScreenshotCaptureState {
        image_data: Arc::new(Mutex::new(None)),
    });
}

#[tauri::command]
pub fn toggle_screenshot_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshot") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            use screenshots::Screen;
            let screens = Screen::all().map_err(|e| e.to_string())?;
            let screen = screens
                .iter()
                .find(|s| s.display_info.is_primary)
                .or_else(|| screens.first())
                .ok_or("no screen found")?;

            let sx = screen.display_info.x;
            let sy = screen.display_info.y;
            let sw = screen.display_info.width;
            let sh = screen.display_info.height;

            // Step 1: capture FIRST (pure BitBlt, ~5ms) BEFORE window is shown.
            // This guarantees the screenshot window itself never appears in the image.
            let captured = screen.capture().map_err(|e| e.to_string())?;
            let w = captured.width();
            let h = captured.height();
            let raw = captured.into_raw();

            // Step 2: show window immediately after capture.
            win.set_position(tauri::PhysicalPosition::new(sx, sy))
                .map_err(|e| e.to_string())?;
            win.set_size(tauri::PhysicalSize::new(sw, sh))
                .map_err(|e| e.to_string())?;
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;

            // Step 3: encode JPEG in background thread (~30ms).
            // Raw pixels are already in memory; encoding is the only remaining work.
            let app2 = app.clone();
            std::thread::spawn(move || {
                let rgba = match RgbaImage::from_raw(w, h, raw) {
                    Some(i) => i,
                    None => return,
                };
                match encode_image_jpeg(&rgba, w, 92) {
                    Ok((b64, _, _)) => {
                        let _ = app2.emit_to("screenshot", "screenshot-ready", b64);
                    }
                    Err(e) => eprintln!("[screenshot] encode failed: {}", e),
                }
            });
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_screenshot_editor_window(app: tauri::AppHandle, width: u32, height: u32) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshot") {
        let editor_width = width.saturating_add(120).max(940);
        let editor_height = height.saturating_add(150).max(460);
        win.set_size(tauri::PhysicalSize::new(editor_width, editor_height))
            .map_err(|e| e.to_string())?;
        win.center().map_err(|e| e.to_string())?;
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Frontend calls this on mount to retrieve a captured image (one-shot, legacy).
#[tauri::command]
pub fn get_pending_screenshot(state: tauri::State<'_, ScreenshotCaptureState>) -> Option<String> {
    state.image_data.lock().unwrap().take()
}

/// Write base64-encoded image bytes to the given file path.
#[tauri::command]
pub fn screenshot_write_file(path: String, data: String) -> Result<(), String> {
    let bytes = BASE64.decode(&data).map_err(|e| e.to_string())?;
    fs::write(&path, &bytes).map_err(|e| e.to_string())
}
