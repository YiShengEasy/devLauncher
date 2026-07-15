use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
#[cfg(not(target_os = "macos"))]
use image::RgbaImage;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(not(target_os = "macos"))]
use crate::utils::image::encode_image_jpeg;

pub struct ScreenshotCaptureState {
    pub image_data: Arc<Mutex<Option<String>>>,
    pub pinned_images: Arc<Mutex<HashMap<String, PinnedScreenshotPayload>>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedScreenshotPayload {
    pub data: String,
    pub width: u32,
    pub height: u32,
}

#[cfg(target_os = "macos")]
fn set_capture_window_bounds(
    win: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    win.set_position(tauri::LogicalPosition::new(x as f64, y as f64))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::LogicalSize::new(width as f64, height as f64))
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
fn set_capture_window_bounds(
    win: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    win.set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn set_editor_window_size(
    win: &tauri::WebviewWindow,
    width: u32,
    height: u32,
) -> Result<(), String> {
    win.set_size(tauri::LogicalSize::new(width as f64, height as f64))
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
fn set_editor_window_size(
    win: &tauri::WebviewWindow,
    width: u32,
    height: u32,
) -> Result<(), String> {
    win.set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn prepare_capture_window_for_current_space(win: &tauri::WebviewWindow) -> Result<(), String> {
    use objc2_app_kit::NSWindowCollectionBehavior;

    win.set_visible_on_all_workspaces(true)
        .map_err(|e| e.to_string())?;

    let ns_window = ns_window(win)?;
    let behavior = ns_window.collectionBehavior()
        | NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::Stationary;
    ns_window.setCollectionBehavior(behavior);

    Ok(())
}

#[cfg(target_os = "macos")]
fn ns_window(win: &tauri::WebviewWindow) -> Result<&objc2_app_kit::NSWindow, String> {
    use objc2_app_kit::NSWindow;

    let ns_window = win.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;
    (unsafe { ns_window.as_ref() }).ok_or_else(|| "screenshot ns_window is null".to_string())
}

#[cfg(not(target_os = "macos"))]
fn prepare_capture_window_for_current_space(win: &tauri::WebviewWindow) -> Result<(), String> {
    win.set_visible_on_all_workspaces(true)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn focus_capture_window(_win: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn focus_capture_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    win.set_focus().map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn show_capture_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    ns_window(win)?.orderFrontRegardless();
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn show_capture_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    win.show().map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn capture_screen_b64() -> Result<String, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let path = std::env::temp_dir().join(format!(
        "devlauncher-screenshot-{}-{stamp}.png",
        std::process::id()
    ));

    let output = Command::new("/usr/sbin/screencapture")
        .arg("-x")
        .arg("-t")
        .arg("png")
        .arg(&path)
        .output()
        .map_err(|e| format!("failed to start screencapture: {e}"))?;

    let bytes = fs::read(&path).map_err(|e| {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if output.status.success() {
            format!("failed to read screenshot: {e}")
        } else {
            format!("screencapture failed: {stderr}")
        }
    })?;
    let _ = fs::remove_file(&path);

    if bytes.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("screencapture produced an empty image: {stderr}"));
    }

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("[screenshot] screencapture returned non-zero but produced an image: {stderr}");
    }

    Ok(BASE64.encode(bytes))
}

pub fn setup(app: &mut tauri::App) {
    app.manage(ScreenshotCaptureState {
        image_data: Arc::new(Mutex::new(None)),
        pinned_images: Arc::new(Mutex::new(HashMap::new())),
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

            // Step 1: prepare geometry before capture so both success and error
            // paths can reuse the same overlay location.
            set_capture_window_bounds(&win, sx, sy, sw, sh)?;
            prepare_capture_window_for_current_space(&win)?;

            // Step 2: capture FIRST, preserving the user's current screen state.
            // On macOS, use the system screencapture tool so Screen Recording
            // permission is handled by the OS capture path instead of the dev binary.
            #[cfg(target_os = "macos")]
            let png_b64 = match capture_screen_b64() {
                Ok(b64) => b64,
                Err(e) => {
                    eprintln!("[screenshot] macOS screencapture failed: {e}");
                    let _ = show_capture_window(&win);
                    let _ = focus_capture_window(&win);
                    let _ = app.emit_to("screenshot", "screenshot-error", e.clone());
                    return Err(e);
                }
            };

            #[cfg(not(target_os = "macos"))]
            let (w, h, raw) = {
                let captured = match screen.capture() {
                    Ok(captured) => captured,
                    Err(e) => {
                        let message = e.to_string();
                        let _ = show_capture_window(&win);
                        let _ = focus_capture_window(&win);
                        let _ = app.emit_to("screenshot", "screenshot-error", message.clone());
                        return Err(message);
                    }
                };
                let w = captured.width();
                let h = captured.height();
                let raw = captured.into_raw();
                (w, h, raw)
            };

            // Step 3: show window immediately after capture.
            show_capture_window(&win)?;
            focus_capture_window(&win)?;

            // Step 4: publish screenshot data to the overlay.
            #[cfg(target_os = "macos")]
            {
                app.emit_to("screenshot", "screenshot-ready", png_b64)
                    .map_err(|e| e.to_string())?;
            }

            #[cfg(not(target_os = "macos"))]
            let app2 = app.clone();
            #[cfg(not(target_os = "macos"))]
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
pub fn show_screenshot_editor_window(
    app: tauri::AppHandle,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshot") {
        let editor_width = width.saturating_add(120).max(940);
        let editor_height = height.saturating_add(150).max(460);
        set_editor_window_size(&win, editor_width, editor_height)?;
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

#[tauri::command]
pub fn create_pinned_screenshot_window(
    app: tauri::AppHandle,
    state: tauri::State<'_, ScreenshotCaptureState>,
    data: String,
    width: u32,
    height: u32,
) -> Result<String, String> {
    if data.trim().is_empty() {
        return Err("pinned screenshot data is empty".to_string());
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let label = format!("screenshot-pin-{stamp}");
    state.pinned_images.lock().unwrap().insert(
        label.clone(),
        PinnedScreenshotPayload {
            data,
            width,
            height,
        },
    );

    let max_w = 920.0_f64;
    let max_h = 680.0_f64;
    let scale = (max_w / width.max(1) as f64)
        .min(max_h / height.max(1) as f64)
        .min(1.0);
    let win_w = (width as f64 * scale).round().max(160.0);
    let win_h = (height as f64 * scale).round().max(120.0);

    let win = WebviewWindowBuilder::new(
        &app,
        label.clone(),
        WebviewUrl::App("index.html?entry=screenshot-pin".into()),
    )
    .title("DevLauncher Pinned Screenshot")
    .inner_size(win_w, win_h)
    .min_inner_size(120.0, 80.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .shadow(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .visible(true)
    .build()
    .map_err(|e| e.to_string())?;

    let _ = win.set_focus();
    Ok(label)
}

#[tauri::command]
pub fn get_pinned_screenshot(
    state: tauri::State<'_, ScreenshotCaptureState>,
    label: String,
) -> Result<PinnedScreenshotPayload, String> {
    state
        .pinned_images
        .lock()
        .unwrap()
        .get(&label)
        .cloned()
        .ok_or_else(|| format!("pinned screenshot not found: {label}"))
}
