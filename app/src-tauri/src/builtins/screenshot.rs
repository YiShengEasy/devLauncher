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

#[derive(Clone, Copy, Debug, PartialEq)]
struct CaptureDisplayBounds {
    id: u32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    is_primary: bool,
}

#[cfg(target_os = "macos")]
#[derive(Clone, Copy, Debug, PartialEq)]
struct MacCaptureTarget {
    display: CaptureDisplayBounds,
    window_y: i32,
}

fn select_capture_display_id(
    displays: &[CaptureDisplayBounds],
    cursor: Option<(f64, f64)>,
) -> Option<u32> {
    cursor
        .and_then(|(cursor_x, cursor_y)| {
            displays.iter().find(|display| {
                let right = display.x as f64 + display.width as f64;
                let bottom = display.y as f64 + display.height as f64;
                cursor_x >= display.x as f64
                    && cursor_x < right
                    && cursor_y >= display.y as f64
                    && cursor_y < bottom
            })
        })
        .or_else(|| displays.iter().find(|display| display.is_primary))
        .or_else(|| displays.first())
        .map(|display| display.id)
}

#[cfg(target_os = "macos")]
fn macos_window_y(display: CaptureDisplayBounds, primary: CaptureDisplayBounds) -> i32 {
    let primary_top = primary.y.saturating_add(primary.height as i32);
    let display_top = display.y.saturating_add(display.height as i32);
    primary_top.saturating_sub(display_top)
}

#[cfg(target_os = "macos")]
fn macos_capture_target() -> Result<MacCaptureTarget, String> {
    use core_graphics::display::CGDisplay;
    use core_graphics::event::CGEvent;
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    let displays = CGDisplay::active_displays()
        .map_err(|error| format!("failed to list active displays: {error:?}"))?
        .into_iter()
        .map(CGDisplay::new)
        .map(|display| {
            let bounds = display.bounds();
            CaptureDisplayBounds {
                id: display.id,
                x: bounds.origin.x.round() as i32,
                y: bounds.origin.y.round() as i32,
                width: bounds.size.width.round().max(1.0) as u32,
                height: bounds.size.height.round().max(1.0) as u32,
                is_primary: display.is_main(),
            }
        })
        .collect::<Vec<_>>();

    let cursor = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
        .and_then(CGEvent::new)
        .ok()
        .map(|event| {
            let point = event.location();
            (point.x, point.y)
        });
    let selected_id = select_capture_display_id(&displays, cursor).ok_or("no screen found")?;
    let display = displays
        .iter()
        .find(|display| display.id == selected_id)
        .copied()
        .ok_or("selected screen disappeared")?;
    let primary = displays
        .iter()
        .find(|display| display.is_primary)
        .copied()
        .or_else(|| displays.first().copied())
        .ok_or("no primary screen found")?;

    Ok(MacCaptureTarget {
        display,
        window_y: macos_window_y(display, primary),
    })
}

#[cfg(target_os = "macos")]
fn macos_capture_region(display: CaptureDisplayBounds) -> String {
    format!(
        "{},{},{},{}",
        display.x, display.y, display.width, display.height
    )
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedScreenshotPayload {
    pub data: String,
    pub width: u32,
    pub height: u32,
}

#[cfg(target_os = "macos")]
fn run_on_main_thread_sync<F>(win: &tauri::WebviewWindow, action: F) -> Result<(), String>
where
    F: FnOnce(&tauri::WebviewWindow) -> Result<(), String> + Send + 'static,
{
    if objc2::MainThreadMarker::new().is_some() {
        return action(win);
    }

    let main_win = win.clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    win.run_on_main_thread(move || {
        let _ = sender.send(action(&main_win));
    })
    .map_err(|error| error.to_string())?;

    receiver
        .recv_timeout(std::time::Duration::from_secs(3))
        .map_err(|error| format!("timed out moving screenshot window to main thread: {error}"))?
}

#[cfg(target_os = "macos")]
fn set_capture_window_bounds(
    win: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    run_on_main_thread_sync(win, move |win| {
        use objc2_foundation::{NSPoint, NSRect, NSSize};

        let frame = NSRect::new(
            NSPoint::new(x as f64, y as f64),
            NSSize::new(width as f64, height as f64),
        );
        ns_window(win)?.setFrame_display(frame, true);
        Ok(())
    })
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

    run_on_main_thread_sync(win, |win| {
        let ns_window = ns_window(win)?;
        let behavior = ns_window.collectionBehavior()
            | NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary;
        ns_window.setCollectionBehavior(behavior);
        Ok(())
    })
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
fn focus_capture_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    win.set_focus().map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
fn focus_capture_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    win.set_focus().map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn show_capture_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    run_on_main_thread_sync(win, |win| {
        ns_window(win)?.orderFrontRegardless();
        Ok(())
    })
}

#[cfg(not(target_os = "macos"))]
fn show_capture_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    win.show().map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn capture_screen_b64(display: CaptureDisplayBounds) -> Result<String, String> {
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
        .arg("-R")
        .arg(macos_capture_region(display))
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

fn capture_and_show_screenshot(
    app: &tauri::AppHandle,
    win: &tauri::WebviewWindow,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let (capture_bounds, sx, sy, sw, sh) = {
        let target = macos_capture_target()?;
        (
            target.display,
            target.display.x,
            target.window_y,
            target.display.width,
            target.display.height,
        )
    };

    #[cfg(not(target_os = "macos"))]
    use screenshots::Screen;
    #[cfg(not(target_os = "macos"))]
    let screens = Screen::all().map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let displays = screens
        .iter()
        .map(|screen| CaptureDisplayBounds {
            id: screen.display_info.id,
            x: screen.display_info.x,
            y: screen.display_info.y,
            width: screen.display_info.width,
            height: screen.display_info.height,
            is_primary: screen.display_info.is_primary,
        })
        .collect::<Vec<_>>();
    #[cfg(not(target_os = "macos"))]
    let cursor = app
        .cursor_position()
        .ok()
        .map(|position| (position.x, position.y));
    #[cfg(not(target_os = "macos"))]
    let selected_id = select_capture_display_id(&displays, cursor).ok_or("no screen found")?;
    #[cfg(not(target_os = "macos"))]
    let screen = screens
        .iter()
        .find(|screen| screen.display_info.id == selected_id)
        .ok_or("no screen found")?;

    #[cfg(not(target_os = "macos"))]
    let sx = screen.display_info.x;
    #[cfg(not(target_os = "macos"))]
    let sy = screen.display_info.y;
    #[cfg(not(target_os = "macos"))]
    let sw = screen.display_info.width;
    #[cfg(not(target_os = "macos"))]
    let sh = screen.display_info.height;

    // Step 1: prepare geometry before capture so both success and error
    // paths can reuse the same overlay location.
    set_capture_window_bounds(win, sx, sy, sw, sh)?;
    prepare_capture_window_for_current_space(win)?;

    // Step 2: capture FIRST, preserving the user's current screen state.
    // On macOS, use the system screencapture tool so Screen Recording
    // permission is handled by the OS capture path instead of the dev binary.
    #[cfg(target_os = "macos")]
    let png_b64 = match capture_screen_b64(capture_bounds) {
        Ok(b64) => b64,
        Err(e) => {
            eprintln!("[screenshot] macOS screencapture failed: {e}");
            let _ = show_capture_window(win);
            let _ = focus_capture_window(win);
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
                let _ = show_capture_window(win);
                let _ = focus_capture_window(win);
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
    show_capture_window(win)?;
    focus_capture_window(win)?;

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

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{select_capture_display_id, CaptureDisplayBounds};

    fn displays() -> Vec<CaptureDisplayBounds> {
        vec![
            CaptureDisplayBounds {
                id: 1,
                x: 0,
                y: 0,
                width: 1728,
                height: 1117,
                is_primary: true,
            },
            CaptureDisplayBounds {
                id: 2,
                x: -1920,
                y: -140,
                width: 1920,
                height: 1080,
                is_primary: false,
            },
            CaptureDisplayBounds {
                id: 3,
                x: 1728,
                y: 120,
                width: 2560,
                height: 1440,
                is_primary: false,
            },
        ]
    }

    #[test]
    fn selects_display_containing_cursor_with_negative_coordinates() {
        assert_eq!(
            select_capture_display_id(&displays(), Some((-600.0, 400.0))),
            Some(2)
        );
        assert_eq!(
            select_capture_display_id(&displays(), Some((2200.0, 800.0))),
            Some(3)
        );
    }

    #[test]
    fn falls_back_to_primary_when_cursor_is_unavailable_or_outside() {
        assert_eq!(select_capture_display_id(&displays(), None), Some(1));
        assert_eq!(
            select_capture_display_id(&displays(), Some((9000.0, 9000.0))),
            Some(1)
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn formats_full_display_regions_for_screencapture() {
        assert_eq!(super::macos_capture_region(displays()[0]), "0,0,1728,1117");
        assert_eq!(
            super::macos_capture_region(displays()[1]),
            "-1920,-140,1920,1080"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn converts_core_graphics_display_y_to_appkit_window_y() {
        let test_displays = displays();
        assert_eq!(super::macos_window_y(test_displays[0], test_displays[0]), 0);
        assert_eq!(
            super::macos_window_y(test_displays[1], test_displays[0]),
            177
        );
        assert_eq!(
            super::macos_window_y(test_displays[2], test_displays[0]),
            -443
        );
    }
}

#[tauri::command]
pub fn toggle_screenshot_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshot") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            capture_and_show_screenshot(&app, &win)?;
        }
    }
    Ok(())
}

/// Show the screenshot overlay without toggling it off.
///
/// Global shortcut callbacks can overlap while the capture process is still
/// running. Keeping this path idempotent prevents a duplicate callback from
/// hiding the overlay immediately after the first callback shows it.
#[tauri::command]
pub fn show_screenshot_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshot") {
        if win.is_visible().unwrap_or(false) {
            #[cfg(target_os = "macos")]
            {
                let target = macos_capture_target()?;
                set_capture_window_bounds(
                    &win,
                    target.display.x,
                    target.window_y,
                    target.display.width,
                    target.display.height,
                )?;
            }
            focus_capture_window(&win)?;
        } else {
            capture_and_show_screenshot(&app, &win)?;
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
