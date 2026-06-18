use crate::config;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};

#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct EntryWindowPosition {
    pub x: i32,
    pub y: i32,
}

const KEYBOARD_PET_DOCK_OFFSET_X: i32 = -18;
const KEYBOARD_PET_DOCK_OFFSET_Y: i32 = -150;
const PET_ACTION_EVENT: &str = "pet-action-state";
const PET_CODEX_STATUS_EVENT: &str = "pet-codex-status";

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub struct PetCodexStatusPayload {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[cfg(target_os = "macos")]
fn ns_window(win: &tauri::WebviewWindow) -> Result<&objc2_app_kit::NSWindow, String> {
    use objc2_app_kit::NSWindow;

    let ns_window = win.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;
    (unsafe { ns_window.as_ref() }).ok_or_else(|| "entry ns_window is null".to_string())
}

#[cfg(target_os = "macos")]
fn prepare_entry_window_for_current_space(win: &tauri::WebviewWindow) -> Result<(), String> {
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

#[cfg(not(target_os = "macos"))]
fn prepare_entry_window_for_current_space(_win: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn focus_entry_window(_win: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn focus_entry_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    win.set_focus().map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn show_entry_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    ns_window(win)?.orderFrontRegardless();
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn show_entry_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    win.show().map_err(|e| e.to_string())
}

fn show_window(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    prepare_entry_window_for_current_space(&win)?;
    show_entry_window(&win)?;
    win.unminimize().map_err(|e| e.to_string())?;
    focus_entry_window(&win)?;
    Ok(())
}

fn is_window_center_on_screen(
    app: &tauri::AppHandle,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> bool {
    let center_x = position.x + (size.width / 2) as i32;
    let center_y = position.y + (size.height / 2) as i32;

    let Ok(monitors) = app.available_monitors() else {
        return true;
    };

    monitors.iter().any(|monitor| {
        let area = monitor.work_area();
        let x1 = area.position.x;
        let y1 = area.position.y;
        let x2 = x1 + area.size.width as i32;
        let y2 = y1 + area.size.height as i32;
        center_x >= x1 && center_x <= x2 && center_y >= y1 && center_y <= y2
    })
}

pub fn restore_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "window not found: main".to_string())?;

    prepare_entry_window_for_current_space(&win)?;
    show_entry_window(&win)?;
    win.unminimize().map_err(|e| e.to_string())?;

    let should_center = match (win.outer_position(), win.outer_size()) {
        (Ok(position), Ok(size)) => !is_window_center_on_screen(app, position, size),
        _ => true,
    };
    if should_center {
        win.center().map_err(|e| e.to_string())?;
    }

    focus_entry_window(&win)?;
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

fn hide_window_if_present(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(label) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn set_pet_action(app: &tauri::AppHandle, action: &str) {
    let _ = app.emit(PET_ACTION_EVENT, action);
}

#[tauri::command]
pub fn set_pet_codex_status(
    app: tauri::AppHandle,
    payload: PetCodexStatusPayload,
) -> Result<(), String> {
    let config = config::load_config(app.clone())?;
    if !config.pet.codex.enabled {
        return Ok(());
    }
    app.emit(PET_CODEX_STATUS_EVENT, payload)
        .map_err(|e| e.to_string())
}

fn show_entry_mode_window(
    app: &tauri::AppHandle,
    label: &str,
    hidden_label: &str,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    hide_window_if_present(app, hidden_label)?;
    set_position_if_present(app, label, position)?;
    if label == "main" {
        return restore_main_window(app);
    }
    show_window(app, label)
}

fn keyboard_pet_position(main_position: EntryWindowPosition) -> EntryWindowPosition {
    EntryWindowPosition {
        x: main_position.x + KEYBOARD_PET_DOCK_OFFSET_X,
        y: main_position.y + KEYBOARD_PET_DOCK_OFFSET_Y,
    }
}

fn dock_pet_for_keyboard(
    app: &tauri::AppHandle,
    main_position: EntryWindowPosition,
) -> Result<(), String> {
    set_position_if_present(app, "pet", Some(keyboard_pet_position(main_position)))?;
    show_window(app, "pet")
}

fn toggle_window(app: tauri::AppHandle, label: &str) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(label) {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            prepare_entry_window_for_current_space(&win)?;
            show_entry_window(&win)?;
            focus_entry_window(&win)?;
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
    set_position_if_present(&app, "pet", position)?;
    show_window(&app, "pet")
}

#[tauri::command]
pub fn show_keyboard_window(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    if let Some(position) = position {
        set_position_if_present(&app, "main", Some(position))?;
        restore_main_window(&app)?;
        return dock_pet_for_keyboard(&app, position);
    }

    restore_main_window(&app)?;
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "window not found: main".to_string())?;
    let position = main.outer_position().map_err(|e| e.to_string())?;
    dock_pet_for_keyboard(
        &app,
        EntryWindowPosition {
            x: position.x,
            y: position.y,
        },
    )
}

#[tauri::command]
pub fn switch_to_pet_mode(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    show_entry_mode_window(&app, "pet", "main", position)
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
    if let Some(win) = app.get_webview_window("pet") {
        if win.is_visible().unwrap_or(false) {
            return win.hide().map_err(|e| e.to_string());
        }
    }
    set_pet_action(&app, "cozy");
    show_pet_window(app, None)
}

pub fn toggle_keyboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            set_pet_action(&app, "cozy");
            return win.hide().map_err(|e| e.to_string());
        }
    }

    show_keyboard_window(app, None)
}
