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
use tokio::sync::oneshot;

#[cfg(not(target_os = "macos"))]
use crate::utils::image::encode_image_jpeg;

pub struct ScreenshotCaptureState {
    pub image_data: Arc<Mutex<Option<String>>>,
    pub pinned_images: Arc<Mutex<HashMap<String, PinnedScreenshotPayload>>>,
    workflow_request: Arc<Mutex<Option<PendingWorkflowScreenshot>>>,
}

const MAX_WORKFLOW_SCREENSHOT_BYTES: usize = 50 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotWorkflowRequest {
    pub request_id: String,
    pub copy_to_clipboard: bool,
}

#[derive(Clone, Debug)]
pub struct ScreenshotWorkflowCompletion {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub copied_to_clipboard: bool,
}

struct PendingWorkflowScreenshot {
    request: ScreenshotWorkflowRequest,
    run_id: String,
    step_id: String,
    sender: oneshot::Sender<Result<ScreenshotWorkflowCompletion, String>>,
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
        workflow_request: Arc::new(Mutex::new(None)),
    });
}

fn safe_artifact_component(value: &str) -> String {
    let value = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if value.is_empty() {
        "unknown".into()
    } else {
        value
    }
}

fn workflow_artifact_path(
    app: &tauri::AppHandle,
    run_id: &str,
    step_id: &str,
    request_id: &str,
) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("SCREENSHOT_ARTIFACT_WRITE_FAILED: {error}"))?
        .join("workflow-artifacts")
        .join(safe_artifact_component(run_id));
    fs::create_dir_all(&directory)
        .map_err(|error| format!("SCREENSHOT_ARTIFACT_WRITE_FAILED: {error}"))?;
    Ok(directory.join(format!(
        "{}-{}.png",
        safe_artifact_component(step_id),
        safe_artifact_component(request_id)
    )))
}

fn hide_screenshot_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("screenshot") {
        let _ = window.hide();
    }
}

fn fail_workflow_request(state: &ScreenshotCaptureState, request_id: &str, error: String) -> bool {
    let pending = {
        let mut slot = state.workflow_request.lock().unwrap();
        if slot
            .as_ref()
            .map(|pending| pending.request.request_id.as_str())
            != Some(request_id)
        {
            return false;
        }
        slot.take()
    };
    if let Some(pending) = pending {
        let _ = pending.sender.send(Err(error));
        true
    } else {
        false
    }
}

pub async fn capture_for_workflow(
    app: &tauri::AppHandle,
    run_id: &str,
    step_id: &str,
    copy_to_clipboard: bool,
    timeout_seconds: u64,
) -> Result<ScreenshotWorkflowCompletion, String> {
    let window = app
        .get_webview_window("screenshot")
        .ok_or_else(|| "SCREENSHOT_CAPTURE_FAILED: screenshot window not found".to_string())?;
    if window.is_visible().unwrap_or(false) {
        return Err("SCREENSHOT_BUSY: screenshot overlay is already open".into());
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("SCREENSHOT_CAPTURE_FAILED: {error}"))?
        .as_millis();
    let request_id = format!("workflow-screenshot-{stamp}");
    let (sender, receiver) = oneshot::channel();
    {
        let state = app.state::<ScreenshotCaptureState>();
        let mut slot = state.workflow_request.lock().unwrap();
        if slot.is_some() {
            return Err("SCREENSHOT_BUSY: another workflow capture is active".into());
        }
        *slot = Some(PendingWorkflowScreenshot {
            request: ScreenshotWorkflowRequest {
                request_id: request_id.clone(),
                copy_to_clipboard,
            },
            run_id: run_id.into(),
            step_id: step_id.into(),
            sender,
        });
    }

    if let Err(error) = show_screenshot_window(app.clone()) {
        let state = app.state::<ScreenshotCaptureState>();
        fail_workflow_request(
            &state,
            &request_id,
            format!("SCREENSHOT_CAPTURE_FAILED: {error}"),
        );
    }

    let timeout_seconds = timeout_seconds.clamp(1, 3_600);
    match tokio::time::timeout(std::time::Duration::from_secs(timeout_seconds), receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("SCREENSHOT_CANCELLED: screenshot request was released".into()),
        Err(_) => {
            let state = app.state::<ScreenshotCaptureState>();
            fail_workflow_request(
                &state,
                &request_id,
                "SCREENSHOT_TIMEOUT: screenshot interaction timed out".into(),
            );
            hide_screenshot_window(app);
            Err("SCREENSHOT_TIMEOUT: screenshot interaction timed out".into())
        }
    }
}

pub fn cancel_workflow_capture(app: &tauri::AppHandle, run_id: &str, step_id: &str) -> bool {
    let state = app.state::<ScreenshotCaptureState>();
    let pending = {
        let mut slot = state.workflow_request.lock().unwrap();
        if !slot
            .as_ref()
            .map(|pending| pending.run_id == run_id && pending.step_id == step_id)
            .unwrap_or(false)
        {
            return false;
        }
        slot.take()
    };
    if let Some(pending) = pending {
        let _ = pending
            .sender
            .send(Err("SCREENSHOT_CANCELLED: workflow was cancelled".into()));
        hide_screenshot_window(app);
        true
    } else {
        false
    }
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
    use super::{safe_artifact_component, select_capture_display_id, CaptureDisplayBounds};

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

    #[test]
    fn sanitizes_workflow_artifact_path_components() {
        assert_eq!(safe_artifact_component("run-1"), "run-1");
        assert_eq!(safe_artifact_component("../../private"), "______private");
        assert_eq!(safe_artifact_component(""), "unknown");
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
pub fn get_active_screenshot_workflow_request(
    state: tauri::State<'_, ScreenshotCaptureState>,
) -> Option<ScreenshotWorkflowRequest> {
    state
        .workflow_request
        .lock()
        .unwrap()
        .as_ref()
        .map(|pending| pending.request.clone())
}

#[tauri::command]
pub fn complete_screenshot_workflow_capture(
    app: tauri::AppHandle,
    state: tauri::State<'_, ScreenshotCaptureState>,
    request_id: String,
    data: String,
    width: u32,
    height: u32,
    copied_to_clipboard: bool,
    destination_path: Option<String>,
) -> Result<String, String> {
    if width == 0 || height == 0 {
        return Err("SCREENSHOT_CAPTURE_FAILED: image dimensions are empty".into());
    }
    let bytes = BASE64
        .decode(&data)
        .map_err(|error| format!("SCREENSHOT_CAPTURE_FAILED: {error}"))?;
    if bytes.is_empty() || bytes.len() > MAX_WORKFLOW_SCREENSHOT_BYTES {
        return Err(format!(
            "SCREENSHOT_CAPTURE_FAILED: image size must be between 1 and {MAX_WORKFLOW_SCREENSHOT_BYTES} bytes"
        ));
    }
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("SCREENSHOT_CAPTURE_FAILED: result is not a PNG image".into());
    }

    let (run_id, step_id) = {
        let slot = state.workflow_request.lock().unwrap();
        let pending = slot
            .as_ref()
            .ok_or_else(|| "SCREENSHOT_CANCELLED: no active workflow capture".to_string())?;
        if pending.request.request_id != request_id {
            return Err("SCREENSHOT_CANCELLED: screenshot request no longer matches".into());
        }
        (pending.run_id.clone(), pending.step_id.clone())
    };

    let user_selected_path = destination_path
        .filter(|path| !path.trim().is_empty())
        .map(std::path::PathBuf::from);
    let uses_managed_path = user_selected_path.is_none();
    let path = match user_selected_path {
        Some(path) => {
            fs::write(&path, &bytes)
                .map_err(|error| format!("SCREENSHOT_ARTIFACT_WRITE_FAILED: {error}"))?;
            path
        }
        None => {
            let path = workflow_artifact_path(&app, &run_id, &step_id, &request_id)?;
            let temporary_path = path.with_extension("png.tmp");
            fs::write(&temporary_path, &bytes)
                .map_err(|error| format!("SCREENSHOT_ARTIFACT_WRITE_FAILED: {error}"))?;
            fs::rename(&temporary_path, &path)
                .map_err(|error| format!("SCREENSHOT_ARTIFACT_WRITE_FAILED: {error}"))?;
            path
        }
    };

    let pending = {
        let mut slot = state.workflow_request.lock().unwrap();
        if slot
            .as_ref()
            .map(|pending| pending.request.request_id.as_str())
            != Some(request_id.as_str())
        {
            if uses_managed_path {
                let _ = fs::remove_file(&path);
            }
            return Err("SCREENSHOT_CANCELLED: screenshot request no longer matches".into());
        }
        slot.take()
    };
    let completion = ScreenshotWorkflowCompletion {
        path: path.to_string_lossy().into_owned(),
        width,
        height,
        copied_to_clipboard,
    };
    if let Some(pending) = pending {
        let _ = pending.sender.send(Ok(completion.clone()));
    }
    Ok(completion.path)
}

#[tauri::command]
pub fn cancel_screenshot_workflow_capture(
    app: tauri::AppHandle,
    state: tauri::State<'_, ScreenshotCaptureState>,
    request_id: String,
) -> Result<(), String> {
    if !fail_workflow_request(
        &state,
        &request_id,
        "SCREENSHOT_CANCELLED: cancelled by user".into(),
    ) {
        return Ok(());
    }
    hide_screenshot_window(&app);
    Ok(())
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
