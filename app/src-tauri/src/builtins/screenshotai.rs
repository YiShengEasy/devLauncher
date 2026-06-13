use tauri::Manager;

#[tauri::command]
pub fn toggle_screenshotai_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshotai") {
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
pub fn show_screenshotai_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshotai") {
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
