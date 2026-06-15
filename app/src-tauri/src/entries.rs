use tauri::Manager;

#[derive(Debug, serde::Deserialize)]
pub struct EntryWindowPosition {
    pub x: i32,
    pub y: i32,
}

fn show_window(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn set_position_if_present(
    app: &tauri::AppHandle,
    label: &str,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    let Some(position) = position else {
        return Ok(());
    };
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    win.set_position(tauri::PhysicalPosition::new(position.x, position.y))
        .map_err(|e| e.to_string())
}

fn center_window(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    win.center().map_err(|e| e.to_string())
}

fn hide_window_if_present(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(label) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn show_entry_mode_window(
    app: &tauri::AppHandle,
    label: &str,
    hidden_label: &str,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    hide_window_if_present(app, hidden_label)?;
    set_position_if_present(app, label, position)?;
    show_window(app, label)
}

fn toggle_window(app: tauri::AppHandle, label: &str) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(label) {
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
pub fn toggle_search_window(app: tauri::AppHandle) -> Result<(), String> {
    toggle_window(app, "search")
}

#[tauri::command]
pub fn show_search_window(app: tauri::AppHandle) -> Result<(), String> {
    show_window(&app, "search")
}

#[tauri::command]
pub fn show_pet_window(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    show_entry_mode_window(&app, "pet", "main", position)
}

#[tauri::command]
pub fn show_keyboard_window(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    if position.is_none() {
        hide_window_if_present(&app, "pet")?;
        center_window(&app, "main")?;
        return show_window(&app, "main");
    }
    show_entry_mode_window(&app, "main", "pet", position)
}

#[tauri::command]
pub fn switch_to_pet_mode(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    show_pet_window(app, position)
}

#[tauri::command]
pub fn switch_to_keyboard_mode(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    show_keyboard_window(app, position)
}

#[tauri::command]
pub fn toggle_pet_window(app: tauri::AppHandle) -> Result<(), String> {
    toggle_window(app, "pet")
}
