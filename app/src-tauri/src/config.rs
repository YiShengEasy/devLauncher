use crate::types::KeyboardConfig;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

pub fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    data_dir.join("keyboard.yaml")
}

pub fn default_config() -> KeyboardConfig {
    KeyboardConfig {
        pages: vec![],
        theme: Default::default(),
    }
}

#[tauri::command]
pub fn load_config(app: tauri::AppHandle) -> Result<KeyboardConfig, String> {
    let path = config_path(&app);
    if !path.exists() {
        return Ok(default_config());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_yaml::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, config: KeyboardConfig) -> Result<(), String> {
    let path = config_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_yaml::to_string(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_config_path(app: tauri::AppHandle) -> String {
    config_path(&app).to_string_lossy().to_string()
}
