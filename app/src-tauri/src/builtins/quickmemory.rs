use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use crate::window_pinning;

fn apply_pin_state(app: &tauri::AppHandle, label: &str) {
    let _ = window_pinning::apply_window_pin_state(app, label);
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuickMemoryData {
    #[serde(default)]
    pub custom_categories: Vec<QuickMemoryCategory>,
    #[serde(default)]
    pub custom_items: Vec<QuickMemoryItem>,
    #[serde(default)]
    pub order: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub copy_counts: HashMap<String, u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuickMemoryCategory {
    pub id: String,
    pub name: String,
    pub subtitle: String,
    pub accent: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuickMemoryItem {
    pub id: String,
    pub category: String,
    pub title: String,
    pub value: String,
    pub detail: String,
    pub kind: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub priority: bool,
    pub created_at: String,
    pub updated_at: String,
}

fn quickmemory_data_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("quickmemory_data.json")
}

fn read_quickmemory_data_from_path(path: &Path) -> Result<QuickMemoryData, String> {
    if !path.exists() {
        return Ok(QuickMemoryData::default());
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_quickmemory_data_to_path(path: &Path, data: &QuickMemoryData) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_quickmemory_data(app: tauri::AppHandle) -> Result<QuickMemoryData, String> {
    let path = quickmemory_data_path(&app);
    read_quickmemory_data_from_path(&path)
}

#[tauri::command]
pub fn save_quickmemory_data(app: tauri::AppHandle, data: QuickMemoryData) -> Result<(), String> {
    let path = quickmemory_data_path(&app);
    write_quickmemory_data_to_path(&path, &data)
}

#[tauri::command]
pub fn toggle_quickmemory_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("quickmemory") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            apply_pin_state(&app, "quickmemory");
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_file(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("devlauncher-quickmemory-{}-{}.json", name, stamp))
    }

    #[test]
    fn read_missing_file_returns_default_data() {
        let path = temp_file("missing");
        let data =
            read_quickmemory_data_from_path(&path).expect("missing file should return defaults");

        assert!(data.custom_categories.is_empty());
        assert!(data.custom_items.is_empty());
        assert!(data.order.is_empty());
        assert!(data.copy_counts.is_empty());
    }

    #[test]
    fn write_and_read_quickmemory_data() {
        let path = temp_file("roundtrip");
        let data = QuickMemoryData {
            custom_categories: vec![QuickMemoryCategory {
                id: "custom-ai".into(),
                name: "AI".into(),
                subtitle: "模型与提示词".into(),
                accent: "#c084fc".into(),
                created_at: "2026-06-17T00:00:00.000Z".into(),
                updated_at: "2026-06-17T00:00:00.000Z".into(),
            }],
            custom_items: vec![QuickMemoryItem {
                id: "custom-ai-chat".into(),
                category: "custom-ai".into(),
                title: "打开 ChatGPT".into(),
                value: "open https://chatgpt.com".into(),
                detail: "在默认浏览器打开 ChatGPT。".into(),
                kind: "command".into(),
                tags: vec!["ai".into(), "web".into()],
                priority: true,
                created_at: "2026-06-17T00:00:00.000Z".into(),
                updated_at: "2026-06-17T00:00:00.000Z".into(),
            }],
            order: std::collections::HashMap::from([(
                "custom-ai".into(),
                vec!["custom-ai-chat".into()],
            )]),
            copy_counts: std::collections::HashMap::from([("custom-ai-chat".into(), 2)]),
        };

        write_quickmemory_data_to_path(&path, &data).expect("write should succeed");
        let loaded = read_quickmemory_data_from_path(&path).expect("read should succeed");

        assert_eq!(loaded.custom_categories[0].name, "AI");
        assert_eq!(loaded.custom_items[0].value, "open https://chatgpt.com");
        assert_eq!(loaded.copy_counts.get("custom-ai-chat"), Some(&2));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn invalid_json_returns_error_and_keeps_file() {
        let path = temp_file("invalid");
        fs::write(&path, "{broken json").expect("write invalid json");

        let result = read_quickmemory_data_from_path(&path);

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(&path).expect("file should remain"),
            "{broken json"
        );

        let _ = fs::remove_file(path);
    }
}
