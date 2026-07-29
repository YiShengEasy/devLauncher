use crate::types::{Action, KeyboardConfig};
use serde::Serialize;
use std::fs;
use std::process::Command;
use tauri::Manager;

const APP_GROUP_ID: &str = "group.com.yisheng.devlauncher";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WidgetShortcutSnapshot {
    page_index: usize,
    key_id: String,
    name: String,
    symbol: String,
    color: String,
}

#[derive(Serialize)]
struct WidgetSnapshot {
    shortcuts: Vec<WidgetShortcutSnapshot>,
}

fn write_snapshot(path: &std::path::Path, content: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "widget snapshot path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn action_name(action: &Action) -> &str {
    match action {
        Action::App { name, .. }
        | Action::Folder { name, .. }
        | Action::File { name, .. }
        | Action::Url { name, .. }
        | Action::Ssh { name, .. }
        | Action::Script { name, .. }
        | Action::ProjectTask { name, .. }
        | Action::System { name, .. }
        | Action::Builtin { name, .. }
        | Action::Plugin { name, .. }
        | Action::Workflow { name, .. }
        | Action::Capability { name, .. } => name,
    }
}

fn builtin_symbol(feature: &str) -> &'static str {
    match feature {
        "clipboard" => "clipboard.fill",
        "json" => "curlybraces.square.fill",
        "totp" => "key.fill",
        "remotedesk" => "display.2",
        "terminal" => "terminal.fill",
        "screenshot" | "screenshotai" => "camera.viewfinder",
        "webaccounts" => "person.badge.key.fill",
        "quickmemory" => "brain.head.profile",
        "projecttasks" => "checklist",
        _ => "bolt.fill",
    }
}

fn action_appearance(action: &Action) -> (&'static str, &'static str) {
    match action {
        Action::App { .. } => ("app.fill", "#60A5FA"),
        Action::Folder { .. } => ("folder.fill", "#FBBF24"),
        Action::File { .. } => ("doc.fill", "#FBBF24"),
        Action::Url { .. } => ("globe", "#34D399"),
        Action::Ssh { .. } => ("network", "#C084FC"),
        Action::Script { .. } => ("terminal.fill", "#F87171"),
        Action::ProjectTask { .. } => ("checklist", "#22D3EE"),
        Action::System { .. } => ("gearshape.fill", "#94A3B8"),
        Action::Builtin { feature, .. } => (builtin_symbol(feature), "#38BDF8"),
        Action::Plugin { .. } => ("puzzlepiece.extension.fill", "#6EE7B7"),
        Action::Workflow { .. } => ("point.3.connected.trianglepath.dotted", "#FB7185"),
        Action::Capability { .. } => ("wand.and.stars", "#2DD4BF"),
    }
}

#[cfg(target_os = "macos")]
pub fn sync_widget_snapshot(app: &tauri::AppHandle, config: &KeyboardConfig) -> Result<(), String> {
    let shortcuts = config
        .widget
        .shortcuts
        .iter()
        .filter_map(|shortcut| {
            let action = config
                .pages
                .get(shortcut.page_index)?
                .keys
                .get(&shortcut.key_id)?;
            let (symbol, color) = action_appearance(action);
            Some(WidgetShortcutSnapshot {
                page_index: shortcut.page_index,
                key_id: shortcut.key_id.clone(),
                name: action_name(action).to_string(),
                symbol: symbol.to_string(),
                color: color.to_string(),
            })
        })
        .collect();

    let home_dir = app.path().home_dir().map_err(|error| error.to_string())?;
    let group_dir = home_dir
        .join("Library")
        .join("Group Containers")
        .join(APP_GROUP_ID);
    let content = serde_json::to_vec_pretty(&WidgetSnapshot { shortcuts })
        .map_err(|error| error.to_string())?;
    write_snapshot(&group_dir.join("widget-shortcuts.json"), &content)?;

    // Ad-hoc signed local builds cannot use a provisioned `group.*` App Group.
    // Keep an Application Support copy for the Widget's read-only sandbox fallback.
    let local_snapshot = home_dir
        .join("Library")
        .join("Application Support")
        .join("com.yisheng.app")
        .join("widget-shortcuts.json");
    write_snapshot(&local_snapshot, &content)?;

    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            let reloader = parent.join("DevLauncherWidgetReloader");
            if reloader.is_file() {
                let _ = Command::new(reloader).status();
            }
        }
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn sync_widget_snapshot(
    _app: &tauri::AppHandle,
    _config: &KeyboardConfig,
) -> Result<(), String> {
    Ok(())
}
