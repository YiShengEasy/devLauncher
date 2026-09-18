use crate::types::Action;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Default)]
pub struct BindingShortcutState {
    registered: Mutex<Vec<Shortcut>>,
}

fn binding_shortcut(key_id: &str) -> Option<String> {
    let normalized = key_id.trim().to_ascii_uppercase();
    let key = match normalized.as_str() {
        value if value.len() == 1 && value.as_bytes()[0].is_ascii_digit() => {
            format!("Digit{value}")
        }
        value if value.len() == 1 && value.as_bytes()[0].is_ascii_uppercase() => {
            format!("Key{value}")
        }
        _ => return None,
    };

    if cfg!(target_os = "macos") {
        Some(format!("CommandOrControl+Option+{key}"))
    } else {
        Some(format!("Alt+{key}"))
    }
}

fn execute_binding(app: &AppHandle, action: &Action) -> Result<(), String> {
    if matches!(
        action,
        Action::Builtin { feature, .. } if feature == "screenshot"
    ) {
        return crate::builtins::screenshot::show_screenshot_window(app.clone());
    }

    crate::workflow::execute_bound_action(app, action)
}

pub fn setup(app: &AppHandle) {
    app.manage(BindingShortcutState::default());
    if let Err(error) = sync_global_binding_shortcuts(app.clone(), 0) {
        eprintln!("failed to register startup binding shortcuts: {error}");
    }
}

#[tauri::command]
pub fn sync_global_binding_shortcuts(
    app: AppHandle,
    page_index: usize,
) -> Result<Vec<String>, String> {
    let manager = app.global_shortcut();
    let state = app.state::<BindingShortcutState>();
    let previous = {
        let mut registered = state
            .registered
            .lock()
            .map_err(|_| "binding shortcut state is unavailable".to_string())?;
        std::mem::take(&mut *registered)
    };

    if !previous.is_empty() {
        manager
            .unregister_multiple(previous)
            .map_err(|error| format!("failed to unregister previous shortcuts: {error}"))?;
    }

    let config = crate::config::load_config(app.clone())?;
    let page = config
        .pages
        .get(page_index)
        .ok_or_else(|| format!("keyboard page {page_index} not found"))?;
    let mut registered = Vec::new();
    let mut unavailable = Vec::new();

    for (key_id, action) in &page.keys {
        let Some(shortcut) = binding_shortcut(key_id) else {
            continue;
        };
        let parsed = shortcut
            .parse::<Shortcut>()
            .map_err(|error| format!("invalid shortcut {shortcut}: {error}"))?;
        let captured_action = action.clone();
        match manager.on_shortcut(parsed, move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            if let Err(error) = execute_binding(app, &captured_action) {
                eprintln!("global binding shortcut failed: {error}");
            }
        }) {
            Ok(()) => registered.push(parsed),
            Err(error) => {
                eprintln!("global shortcut {shortcut} unavailable: {error}");
                unavailable.push(format!("{key_id} ({shortcut})"));
            }
        }
    }

    *state
        .registered
        .lock()
        .map_err(|_| "binding shortcut state is unavailable".to_string())? = registered;
    Ok(unavailable)
}

#[cfg(test)]
mod tests {
    use super::binding_shortcut;

    #[test]
    fn maps_letters_and_digits_to_global_shortcuts() {
        let letter = binding_shortcut("q").unwrap();
        let digit = binding_shortcut("5").unwrap();

        if cfg!(target_os = "macos") {
            assert_eq!(letter, "CommandOrControl+Option+KeyQ");
            assert_eq!(digit, "CommandOrControl+Option+Digit5");
        } else {
            assert_eq!(letter, "Alt+KeyQ");
            assert_eq!(digit, "Alt+Digit5");
        }
    }

    #[test]
    fn rejects_non_keyboard_binding_ids() {
        assert_eq!(binding_shortcut("F1"), None);
        assert_eq!(binding_shortcut(""), None);
        assert_eq!(binding_shortcut("Space"), None);
    }
}
