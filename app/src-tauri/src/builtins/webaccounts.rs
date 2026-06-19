use crate::window_pinning;
use tauri::Manager;

fn apply_pin_state(app: &tauri::AppHandle, label: &str) {
    let _ = window_pinning::apply_window_pin_state(app, label);
}

#[tauri::command]
pub fn toggle_webaccounts_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("webaccounts") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            apply_pin_state(&app, "webaccounts");
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
