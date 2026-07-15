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
        pet: Default::default(),
    }
}

pub fn read_config_from_path(path: &PathBuf) -> Result<KeyboardConfig, String> {
    if !path.exists() {
        return Ok(default_config());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_yaml::from_str(&content).map_err(|e| e.to_string())
}

pub fn write_config_to_path(path: &PathBuf, config: &KeyboardConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_yaml::to_string(config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_config(app: tauri::AppHandle) -> Result<KeyboardConfig, String> {
    let path = config_path(&app);
    read_config_from_path(&path)
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, config: KeyboardConfig) -> Result<(), String> {
    let path = config_path(&app);
    write_config_to_path(&path, &config)
}

#[tauri::command]
pub fn get_config_path(app: tauri::AppHandle) -> String {
    config_path(&app).to_string_lossy().to_string()
}
