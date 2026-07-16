use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

pub const WINDOW_PIN_CHANGED_EVENT: &str = "window-pin-changed";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPinState {
    pub label: String,
    pub pinned: bool,
    pub default_pinned: bool,
    pub supported: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, Default, PartialEq, Eq)]
struct PersistedPinStates {
    windows: BTreeMap<String, bool>,
}

const SUPPORTED_WINDOWS: &[&str] = &[
    "main",
    "pet",
    "search",
    "clipboard",
    "json-helper",
    "totp",
    "remotedesk",
    "terminal",
    "screenshotai",
    "webaccounts",
    "quickmemory",
];

const DEFAULT_PINNED_WINDOWS: &[&str] = &["main", "pet", "search"];

pub fn is_supported_window(label: &str) -> bool {
    SUPPORTED_WINDOWS.contains(&label)
}

pub fn default_pinned(label: &str) -> bool {
    DEFAULT_PINNED_WINDOWS.contains(&label)
}

fn read_state_file(path: &Path) -> PersistedPinStates {
    let Ok(content) = fs::read_to_string(path) else {
        return PersistedPinStates::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_state_file(path: &Path, state: &PersistedPinStates) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, format!("{content}\n")).map_err(|e| e.to_string())
}

fn resolve_state_from_file(path: &Path, label: &str) -> Result<WindowPinState, String> {
    if !is_supported_window(label) {
        return Err(format!("window does not support pinning: {label}"));
    }
    let persisted = read_state_file(path);
    let default_pinned = default_pinned(label);
    Ok(WindowPinState {
        label: label.to_string(),
        pinned: persisted
            .windows
            .get(label)
            .copied()
            .unwrap_or(default_pinned),
        default_pinned,
        supported: true,
    })
}

fn set_state_in_file(path: &Path, label: &str, pinned: bool) -> Result<WindowPinState, String> {
    if !is_supported_window(label) {
        return Err(format!("window does not support pinning: {label}"));
    }
    let mut persisted = read_state_file(path);
    persisted.windows.insert(label.to_string(), pinned);
    write_state_file(path, &persisted)?;
    resolve_state_from_file(path, label)
}

fn state_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(data_dir.join("window-pin-states.json"))
}

fn get_state_for_app(app: &tauri::AppHandle, label: &str) -> Result<WindowPinState, String> {
    let path = state_file_path(app)?;
    resolve_state_from_file(&path, label)
}

fn set_state_for_app(
    app: &tauri::AppHandle,
    label: &str,
    pinned: bool,
) -> Result<WindowPinState, String> {
    let path = state_file_path(app)?;
    set_state_in_file(&path, label, pinned)
}

#[tauri::command]
pub fn get_window_pin_state(
    app: tauri::AppHandle,
    label: String,
) -> Result<WindowPinState, String> {
    get_state_for_app(&app, &label)
}

#[tauri::command]
pub fn list_window_pin_states(app: tauri::AppHandle) -> Result<Vec<WindowPinState>, String> {
    SUPPORTED_WINDOWS
        .iter()
        .map(|label| get_state_for_app(&app, label))
        .collect()
}

#[cfg(target_os = "macos")]
fn prepare_pinned_window_for_current_space(win: &tauri::WebviewWindow) -> Result<(), String> {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    win.set_visible_on_all_workspaces(true)
        .map_err(|e| e.to_string())?;

    let ns_window = win.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;
    let ns_window =
        unsafe { ns_window.as_ref() }.ok_or_else(|| "window ns_window is null".to_string())?;
    let behavior = ns_window.collectionBehavior()
        | NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::Stationary;
    ns_window.setCollectionBehavior(behavior);
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn prepare_pinned_window_for_current_space(_win: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_always_on_top(win: &tauri::WebviewWindow, pinned: bool) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };

    let hwnd = win.hwnd().map_err(|error| error.to_string())?.0;
    let insert_after = if pinned { HWND_TOPMOST } else { HWND_NOTOPMOST };
    let ok = unsafe {
        SetWindowPos(
            hwnd,
            insert_after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
    };
    if ok == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn apply_always_on_top(win: &tauri::WebviewWindow, pinned: bool) -> Result<(), String> {
    win.set_always_on_top(pinned)
        .map_err(|error| error.to_string())
}

pub fn apply_window_pin_state(
    app: &tauri::AppHandle,
    label: &str,
) -> Result<WindowPinState, String> {
    let state = get_state_for_app(app, label)?;
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {label}"))?;

    apply_always_on_top(&win, state.pinned)?;

    if state.pinned {
        prepare_pinned_window_for_current_space(&win)?;
    }

    Ok(state)
}

#[tauri::command]
pub async fn set_window_pin_state(
    app: tauri::AppHandle,
    label: String,
    pinned: bool,
) -> Result<WindowPinState, String> {
    if !is_supported_window(&label) {
        return Err(format!("window does not support pinning: {label}"));
    }

    let operation_app = app.clone();
    crate::main_window_control::run_serialized(&app, move || {
        let win = operation_app
            .get_webview_window(&label)
            .ok_or_else(|| format!("window not found: {label}"))?;
        apply_always_on_top(&win, pinned)?;
        if pinned {
            prepare_pinned_window_for_current_space(&win)?;
        }
        let state = set_state_for_app(&operation_app, &label, pinned)?;
        operation_app
            .emit(WINDOW_PIN_CHANGED_EVENT, state.clone())
            .map_err(|error| error.to_string())?;
        Ok(state)
    })
    .await
}

pub fn apply_all_startup_pin_states(app: &tauri::AppHandle) {
    for label in SUPPORTED_WINDOWS {
        let _ = apply_window_pin_state(app, label);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_file(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("devlauncher-{name}-{nanos}.json"))
    }

    #[test]
    fn classifies_supported_windows_and_defaults() {
        assert!(is_supported_window("main"));
        assert!(is_supported_window("quickmemory"));
        assert!(!is_supported_window("screenshot"));
        assert!(!is_supported_window("missing"));
        assert!(default_pinned("main"));
        assert!(default_pinned("pet"));
        assert!(default_pinned("search"));
        assert!(!default_pinned("clipboard"));
        assert!(!default_pinned("quickmemory"));
    }

    #[test]
    fn missing_file_uses_default_policy() {
        let path = temp_file("missing-pin-state");
        assert_eq!(resolve_state_from_file(&path, "main").unwrap().pinned, true);
        assert_eq!(
            resolve_state_from_file(&path, "clipboard").unwrap().pinned,
            false
        );
    }

    #[test]
    fn corrupted_file_is_ignored_until_next_write() {
        let path = temp_file("corrupted-pin-state");
        fs::write(&path, "{not json").unwrap();
        assert_eq!(
            resolve_state_from_file(&path, "search").unwrap().pinned,
            true
        );
        let state = set_state_in_file(&path, "search", false).unwrap();
        assert_eq!(state.pinned, false);
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("\"search\": false"));
    }

    #[test]
    fn set_state_persists_per_label_without_affecting_other_windows() {
        let path = temp_file("pin-state");
        set_state_in_file(&path, "clipboard", true).unwrap();
        assert_eq!(
            resolve_state_from_file(&path, "clipboard").unwrap().pinned,
            true
        );
        assert_eq!(
            resolve_state_from_file(&path, "quickmemory")
                .unwrap()
                .pinned,
            false
        );
    }

    #[test]
    fn unsupported_label_returns_clear_error() {
        let path = temp_file("unsupported-pin-state");
        let err = resolve_state_from_file(&path, "screenshot").unwrap_err();
        assert_eq!(err, "window does not support pinning: screenshot");
    }
}
