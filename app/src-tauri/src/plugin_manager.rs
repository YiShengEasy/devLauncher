use crate::plugin_manifest::{validate_manifest, PluginManifest};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use zip::ZipArchive;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub id: String,
    pub version: String,
    pub enabled: bool,
    pub source: String,
    pub installed_at: u64,
    pub manifest: PluginManifest,
}

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
struct InstalledPluginsFile {
    plugins: Vec<InstalledPlugin>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePluginEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub kind: String,
    pub description: Option<String>,
    pub download_url: String,
    pub sha256: String,
    pub icon: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MarketplaceIndex {
    pub version: u32,
    pub plugins: Vec<MarketplacePluginEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginEntryContent {
    pub html: String,
    pub base_url: String,
}

fn plugins_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("plugins"))
}

fn installed_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(plugins_root(app)?.join("installed.json"))
}

fn read_installed_file(app: &tauri::AppHandle) -> Result<InstalledPluginsFile, String> {
    let path = installed_path(app)?;
    if !path.exists() {
        return Ok(InstalledPluginsFile::default());
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_installed_file(app: &tauri::AppHandle, file: &InstalledPluginsFile) -> Result<(), String> {
    let path = installed_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn safe_join(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path.is_absolute() {
        return Err("plugin path must be relative".to_string());
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("plugin path cannot contain parent traversal".to_string());
    }
    Ok(base.join(path))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn url_component(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'.' | b'-' | b'_' => {
                vec![byte as char]
            }
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn extract_plugin_zip(
    app: &tauri::AppHandle,
    bytes: &[u8],
    source: &str,
) -> Result<InstalledPlugin, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut manifest_content = String::new();
    archive
        .by_name("plugin.json")
        .map_err(|_| "plugin.json is required".to_string())?
        .read_to_string(&mut manifest_content)
        .map_err(|e| e.to_string())?;

    let manifest: PluginManifest =
        serde_json::from_str(&manifest_content).map_err(|e| e.to_string())?;
    validate_manifest(&manifest)?;

    let plugin_dir = plugins_root(app)?.join(&manifest.id).join(&manifest.version);
    if plugin_dir.exists() {
        fs::remove_dir_all(&plugin_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&plugin_dir).map_err(|e| e.to_string())?;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|e| e.to_string())?;
        if file.is_dir() {
            continue;
        }

        let out_path = safe_join(&plugin_dir, file.name())?;
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out_file = fs::File::create(out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut file, &mut out_file).map_err(|e| e.to_string())?;
    }

    let entry_path = safe_join(&plugin_dir, &manifest.entry)?;
    if !entry_path.exists() {
        return Err("plugin entry file does not exist".to_string());
    }

    Ok(InstalledPlugin {
        id: manifest.id.clone(),
        version: manifest.version.clone(),
        enabled: true,
        source: source.to_string(),
        installed_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis() as u64,
        manifest,
    })
}

fn upsert_installed(
    app: &tauri::AppHandle,
    plugin: InstalledPlugin,
) -> Result<InstalledPlugin, String> {
    let mut file = read_installed_file(app)?;
    file.plugins.retain(|item| item.id != plugin.id);
    file.plugins.push(plugin.clone());
    write_installed_file(app, &file)?;
    Ok(plugin)
}

#[tauri::command]
pub fn list_installed_plugins(app: tauri::AppHandle) -> Result<Vec<InstalledPlugin>, String> {
    Ok(read_installed_file(&app)?.plugins)
}

#[tauri::command]
pub fn install_plugin_from_zip(
    app: tauri::AppHandle,
    path: String,
) -> Result<InstalledPlugin, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let plugin = extract_plugin_zip(&app, &bytes, "local")?;
    upsert_installed(&app, plugin)
}

#[tauri::command]
pub fn fetch_marketplace_index(url: String) -> Result<MarketplaceIndex, String> {
    if !url.starts_with("https://") {
        return Err("marketplace url must use https".to_string());
    }

    let content = ureq::get(&url)
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())?;
    let index: MarketplaceIndex = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if index.version != 1 {
        return Err("unsupported marketplace index version".to_string());
    }
    Ok(index)
}

#[tauri::command]
pub fn install_plugin_from_market(
    app: tauri::AppHandle,
    entry: MarketplacePluginEntry,
) -> Result<InstalledPlugin, String> {
    if !entry.download_url.starts_with("https://") {
        return Err("plugin download url must use https".to_string());
    }

    let mut reader = ureq::get(&entry.download_url)
        .call()
        .map_err(|e| e.to_string())?
        .into_reader();
    let mut bytes = Vec::new();
    reader.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if sha256_hex(&bytes) != entry.sha256.to_lowercase() {
        return Err("plugin sha256 mismatch".to_string());
    }

    let plugin = extract_plugin_zip(&app, &bytes, "market")?;
    if plugin.id != entry.id || plugin.version != entry.version {
        return Err("market entry does not match plugin manifest".to_string());
    }
    upsert_installed(&app, plugin)
}

#[tauri::command]
pub fn set_plugin_enabled(
    app: tauri::AppHandle,
    plugin_id: String,
    enabled: bool,
) -> Result<Vec<InstalledPlugin>, String> {
    let mut file = read_installed_file(&app)?;
    let Some(plugin) = file.plugins.iter_mut().find(|item| item.id == plugin_id) else {
        return Err("plugin is not installed".to_string());
    };

    plugin.enabled = enabled;
    write_installed_file(&app, &file)?;
    Ok(file.plugins)
}

#[tauri::command]
pub fn uninstall_plugin(
    app: tauri::AppHandle,
    plugin_id: String,
) -> Result<Vec<InstalledPlugin>, String> {
    let mut file = read_installed_file(&app)?;
    let Some(plugin) = file.plugins.iter().find(|item| item.id == plugin_id).cloned() else {
        return Err("plugin is not installed".to_string());
    };

    let dir = plugins_root(&app)?.join(&plugin.id).join(&plugin.version);
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    file.plugins.retain(|item| item.id != plugin_id);
    write_installed_file(&app, &file)?;
    Ok(file.plugins)
}

#[tauri::command]
pub fn get_plugin_entry_url(
    app: tauri::AppHandle,
    plugin_id: String,
    action_id: String,
) -> Result<String, String> {
    let file = read_installed_file(&app)?;
    let Some(plugin) = file.plugins.iter().find(|item| item.id == plugin_id) else {
        return Err("plugin is not installed".to_string());
    };
    if !plugin.enabled {
        return Err("plugin is disabled".to_string());
    }
    if !plugin
        .manifest
        .actions
        .iter()
        .any(|action| action.id == action_id)
    {
        return Err("plugin action is not declared".to_string());
    }

    let plugin_dir = plugins_root(&app)?.join(&plugin.id).join(&plugin.version);
    let entry = safe_join(&plugin_dir, &plugin.manifest.entry)?;
    if !entry.exists() {
        return Err("plugin entry file does not exist".to_string());
    }
    Ok(entry.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_plugin_entry_content(
    app: tauri::AppHandle,
    plugin_id: String,
    action_id: String,
) -> Result<PluginEntryContent, String> {
    let entry = PathBuf::from(get_plugin_entry_url(app, plugin_id, action_id)?);
    let html = fs::read_to_string(&entry).map_err(|e| e.to_string())?;
    let base_dir = entry
        .parent()
        .ok_or_else(|| "plugin entry directory does not exist".to_string())?;
    Ok(PluginEntryContent {
        html,
        base_url: base_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn open_plugin_window(
    app: tauri::AppHandle,
    plugin_id: String,
    action_id: String,
) -> Result<(), String> {
    get_plugin_entry_url(app.clone(), plugin_id.clone(), action_id.clone())?;
    let url = format!(
        "index.html?entry=plugin-host&pluginId={}&actionId={}",
        url_component(&plugin_id),
        url_component(&action_id),
    );

    if let Some(win) = app.get_webview_window("plugin-host") {
        win.eval(&format!(
            "window.location.href = '{}'",
            url.replace('\\', "\\\\").replace('\'', "\\'")
        ))
        .map_err(|e| e.to_string())?;
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "plugin-host", WebviewUrl::App(url.into()))
        .title("DevLauncher Plugin")
        .inner_size(860.0, 620.0)
        .resizable(true)
        .decorations(true)
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}
