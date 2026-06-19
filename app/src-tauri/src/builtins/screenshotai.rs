use crate::window_pinning;
use tauri::Manager;

fn apply_pin_state(app: &tauri::AppHandle, label: &str) {
    let _ = window_pinning::apply_window_pin_state(app, label);
}

#[tauri::command]
pub fn toggle_screenshotai_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshotai") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            apply_pin_state(&app, "screenshotai");
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_screenshotai_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshotai") {
        apply_pin_state(&app, "screenshotai");
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
