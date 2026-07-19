use crate::types::KeyboardConfig;
use std::fs;
use std::io::Write;
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
        schema_version: 2,
        revision: 0,
        pages: vec![],
        workflows: vec![],
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
    let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let content = serde_yaml::to_string(config).map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    temp.persist(path)
        .map(|_| ())
        .map_err(|e| e.error.to_string())
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
