use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

use crate::window_pinning;

fn apply_pin_state(app: &tauri::AppHandle, label: &str) {
    let _ = window_pinning::apply_window_pin_state(app, label);
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TotpToken {
    pub id: String,
    pub name: String,
    pub secret: String,
}

fn totp_tokens_path(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    data_dir.join("totp_tokens.json")
}

fn default_totp_tokens() -> Vec<TotpToken> {
    Vec::new()
}

#[tauri::command]
pub fn load_totp_tokens(app: tauri::AppHandle) -> Result<Vec<TotpToken>, String> {
    let path = totp_tokens_path(&app);
    if !path.exists() {
        let defaults = default_totp_tokens();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&defaults) {
            let _ = fs::write(&path, json);
        }
        return Ok(defaults);
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_totp_tokens(app: tauri::AppHandle, tokens: Vec<TotpToken>) -> Result<(), String> {
    let path = totp_tokens_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&tokens).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_totp_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("totp") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            apply_pin_state(&app, "totp");
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
