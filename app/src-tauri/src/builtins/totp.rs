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
    vec![
        TotpToken {
            id: "aliyun-sl".into(),
            name: "阿里云(石峦科技)".into(),
            secret: "7P5Y6KC5MCFPUXFJ".into(),
        },
        TotpToken {
            id: "aliyun-hl".into(),
            name: "阿里云(瀚联传感)".into(),
            secret: "XK7UIFFXFT33WKG5Z37ASJEY4FFBH2DXDOBT52NZQBKGK7DBMIICLJW4SPX4LX75".into(),
        },
        TotpToken {
            id: "manual".into(),
            name: "手动计算".into(),
            secret: "X476S24ELOBQJXESOAP5SZVM4XGTOU3KTFB5QVVZ5LOAZA6KDHXAJAGBY7HD7UQL".into(),
        },
        TotpToken {
            id: "github".into(),
            name: "GitHub".into(),
            secret: "KML6IWUZ244TM6RS".into(),
        },
        TotpToken {
            id: "parsec".into(),
            name: "Parsec".into(),
            secret: "QELEOOUGTDVNJPAU".into(),
        },
    ]
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
