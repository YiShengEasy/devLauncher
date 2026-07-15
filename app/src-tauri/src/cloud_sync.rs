use crate::builtins::quickmemory::{
    quickmemory_data_path, read_quickmemory_data_from_path, write_quickmemory_data_to_path,
    QuickMemoryData,
};
use crate::config::{config_path, read_config_from_path, write_config_to_path};
use crate::types::KeyboardConfig;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const SYNC_SCHEMA_VERSION: u32 = 1;
const KEYRING_SERVICE: &str = "DevLauncher";
const SYNC_KEYRING_USER: &str = "cloud-sync-key";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncSettings {
    pub base_url: String,
}

impl Default for CloudSyncSettings {
    fn default() -> Self {
        Self {
            base_url: "http://127.0.0.1:8787".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncSnapshotMeta {
    pub id: String,
    pub schema_version: u32,
    pub device_name: Option<String>,
    pub app_version: Option<String>,
    pub content_hash: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncStatus {
    pub base_url: String,
    pub has_sync_key: bool,
    pub latest_snapshot: Option<CloudSyncSnapshotMeta>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncGeneratedKey {
    pub id: String,
    pub sync_key: String,
    pub label: Option<String>,
    pub status: CloudSyncStatus,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncRestoreResult {
    pub snapshot: CloudSyncSnapshotMeta,
    pub backup_paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotUploadPayload {
    schema_version: u32,
    device_name: String,
    app_version: String,
    content_hash: String,
    keyboard_config: KeyboardConfig,
    quickmemory_data: QuickMemoryData,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotPayload {
    id: String,
    schema_version: u32,
    device_name: Option<String>,
    app_version: Option<String>,
    content_hash: String,
    created_at: String,
    keyboard_config: KeyboardConfig,
    quickmemory_data: QuickMemoryData,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusResponse {
    latest_snapshot: Option<CloudSyncSnapshotMeta>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateKeyResponse {
    id: String,
    sync_key: String,
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SnapshotMetaEnvelope {
    snapshot: CloudSyncSnapshotMeta,
}

#[derive(Debug, Deserialize)]
struct SnapshotPayloadEnvelope {
    snapshot: SnapshotPayload,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalSyncKey {
    sync_key: String,
}

fn sync_settings_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("cloud_sync_settings.json")
}

fn sync_key_fallback_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("cloud_sync_key.json")
}

fn normalize_base_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() {
        return Err("同步服务地址不能为空".into());
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("同步服务地址必须以 http:// 或 https:// 开头".into());
    }
    Ok(trimmed)
}

fn load_sync_settings(app: &tauri::AppHandle) -> CloudSyncSettings {
    let path = sync_settings_path(app);
    let Ok(content) = fs::read_to_string(path) else {
        return CloudSyncSettings::default();
    };
    serde_json::from_str(&content).unwrap_or_else(|_| CloudSyncSettings::default())
}

fn save_sync_settings(app: &tauri::AppHandle, base_url: &str) -> Result<CloudSyncSettings, String> {
    let settings = CloudSyncSettings {
        base_url: normalize_base_url(base_url)?,
    };
    let path = sync_settings_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(settings)
}

fn load_sync_key_from_keyring() -> Result<Option<String>, String> {
    match keyring::Entry::new(KEYRING_SERVICE, SYNC_KEYRING_USER)
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(key) if !key.trim().is_empty() => Ok(Some(key)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn save_sync_key_to_fallback(app: &tauri::AppHandle, sync_key: &str) -> Result<(), String> {
    let path = sync_key_fallback_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&LocalSyncKey {
        sync_key: sync_key.to_string(),
    })
    .map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(&path)
            .map_err(|e| e.to_string())?
            .permissions();
        permissions.set_mode(0o600);
        fs::set_permissions(&path, permissions).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn load_sync_key_from_fallback(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = sync_key_fallback_path(app);
    let Ok(content) = fs::read_to_string(path) else {
        return Ok(None);
    };
    let local_key: LocalSyncKey = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let sync_key = local_key.sync_key.trim().to_string();
    Ok((!sync_key.is_empty()).then_some(sync_key))
}

fn save_sync_key(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let sync_key = key.trim();
    if sync_key.is_empty() {
        return Err("同步密钥不能为空".into());
    }

    let keyring_result = keyring::Entry::new(KEYRING_SERVICE, SYNC_KEYRING_USER)
        .map_err(|e| e.to_string())
        .and_then(|entry| entry.set_password(sync_key).map_err(|e| e.to_string()));

    if keyring_result.is_ok() {
        if let Some(saved_key) = load_sync_key_from_keyring()? {
            if saved_key.trim() == sync_key {
                return Ok(());
            }
        }
    }

    save_sync_key_to_fallback(app, sync_key)?;
    let saved_key = load_sync_key(app)?
        .ok_or_else(|| "同步密钥写入后无法从本机凭据存储读取，请重新保存。".to_string())?;
    if saved_key.trim() != sync_key {
        return Err("同步密钥写入后读取结果不一致，请重新保存。".into());
    }

    Ok(())
}

fn load_sync_key(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    if let Some(sync_key) = load_sync_key_from_keyring()? {
        return Ok(Some(sync_key));
    }
    load_sync_key_from_fallback(app)
}

fn auth_header(sync_key: &str) -> String {
    format!("Bearer {}", sync_key.trim())
}

fn device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DevLauncher device".to_string())
}

fn content_hash(
    keyboard_config: &KeyboardConfig,
    quickmemory_data: &QuickMemoryData,
) -> Result<String, String> {
    let value = serde_json::json!({
        "schemaVersion": SYNC_SCHEMA_VERSION,
        "keyboardConfig": keyboard_config,
        "quickmemoryData": quickmemory_data,
    });
    let bytes = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
    let digest = Sha256::digest(bytes);
    Ok(format!("{:x}", digest))
}

fn map_http_error(error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(code, response) => {
            let body = response.into_string().unwrap_or_default();
            if body.is_empty() {
                format!("同步服务返回错误状态: {}", code)
            } else {
                format!("同步服务返回错误状态 {}: {}", code, body)
            }
        }
        ureq::Error::Transport(err) => format!("无法连接同步服务: {}", err),
    }
}

fn response_json<T: for<'de> Deserialize<'de>>(response: ureq::Response) -> Result<T, String> {
    let body = response.into_string().map_err(|e| e.to_string())?;
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

fn backup_existing_file(path: &Path) -> Result<Option<PathBuf>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "无法生成备份文件名".to_string())?;
    let backup_path = path.with_file_name(format!("{}.bak-{}", file_name, stamp));
    fs::copy(path, &backup_path).map_err(|e| e.to_string())?;
    Ok(Some(backup_path))
}

fn assemble_upload_payload(app: &tauri::AppHandle) -> Result<SnapshotUploadPayload, String> {
    let keyboard_config = read_config_from_path(&config_path(app))?;
    let quickmemory_data = read_quickmemory_data_from_path(&quickmemory_data_path(app))?;
    let content_hash = content_hash(&keyboard_config, &quickmemory_data)?;

    Ok(SnapshotUploadPayload {
        schema_version: SYNC_SCHEMA_VERSION,
        device_name: device_name(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        content_hash,
        keyboard_config,
        quickmemory_data,
    })
}

fn require_sync_key(app: &tauri::AppHandle) -> Result<String, String> {
    load_sync_key(app)?.ok_or_else(|| "请先保存同步密钥".to_string())
}

#[tauri::command]
pub fn sync_save_key(
    app: tauri::AppHandle,
    key: String,
    base_url: String,
) -> Result<CloudSyncStatus, String> {
    let settings = save_sync_settings(&app, &base_url)?;
    save_sync_key(&app, &key)?;
    Ok(CloudSyncStatus {
        base_url: settings.base_url,
        has_sync_key: true,
        latest_snapshot: None,
    })
}

#[tauri::command]
pub fn sync_generate_key(
    app: tauri::AppHandle,
    base_url: String,
    label: Option<String>,
) -> Result<CloudSyncGeneratedKey, String> {
    let settings = save_sync_settings(&app, &base_url)?;
    let request_body = serde_json::json!({
        "label": label
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("primary"),
    });
    let url = format!("{}/api/sync/keys", settings.base_url);
    let response = ureq::post(&url)
        .set("content-type", "application/json")
        .send_string(&request_body.to_string())
        .map_err(map_http_error)?;
    let generated: GenerateKeyResponse = response_json(response)?;

    save_sync_key(&app, &generated.sync_key)?;

    Ok(CloudSyncGeneratedKey {
        id: generated.id,
        sync_key: generated.sync_key,
        label: generated.label,
        status: CloudSyncStatus {
            base_url: settings.base_url,
            has_sync_key: true,
            latest_snapshot: None,
        },
    })
}

#[tauri::command]
pub fn sync_get_status(app: tauri::AppHandle) -> Result<CloudSyncStatus, String> {
    let settings = load_sync_settings(&app);
    let Some(sync_key) = load_sync_key(&app)? else {
        return Ok(CloudSyncStatus {
            base_url: settings.base_url,
            has_sync_key: false,
            latest_snapshot: None,
        });
    };

    let url = format!("{}/api/sync/status", settings.base_url);
    let response = ureq::get(&url)
        .set("authorization", &auth_header(&sync_key))
        .call()
        .map_err(map_http_error)?;
    let status: StatusResponse = response_json(response)?;

    Ok(CloudSyncStatus {
        base_url: settings.base_url,
        has_sync_key: true,
        latest_snapshot: status.latest_snapshot,
    })
}

#[tauri::command]
pub fn sync_upload_snapshot(app: tauri::AppHandle) -> Result<CloudSyncSnapshotMeta, String> {
    let settings = load_sync_settings(&app);
    let sync_key = require_sync_key(&app)?;
    let payload = assemble_upload_payload(&app)?;
    let url = format!("{}/api/sync/snapshots", settings.base_url);
    let body = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

    let response = ureq::post(&url)
        .set("authorization", &auth_header(&sync_key))
        .set("content-type", "application/json")
        .send_string(&body)
        .map_err(map_http_error)?;
    let envelope: SnapshotMetaEnvelope = response_json(response)?;
    Ok(envelope.snapshot)
}

#[tauri::command]
pub fn sync_restore_latest_snapshot(
    app: tauri::AppHandle,
) -> Result<CloudSyncRestoreResult, String> {
    let settings = load_sync_settings(&app);
    let sync_key = require_sync_key(&app)?;
    let url = format!("{}/api/sync/snapshots/latest", settings.base_url);

    let response = ureq::get(&url)
        .set("authorization", &auth_header(&sync_key))
        .call()
        .map_err(map_http_error)?;
    let envelope: SnapshotPayloadEnvelope = response_json(response)?;
    let snapshot = envelope.snapshot;

    if snapshot.schema_version != SYNC_SCHEMA_VERSION {
        return Err(format!("不支持的同步数据版本: {}", snapshot.schema_version));
    }

    let config_file = config_path(&app);
    let quickmemory_file = quickmemory_data_path(&app);
    let mut backup_paths = Vec::new();

    if let Some(path) = backup_existing_file(&config_file)? {
        backup_paths.push(path.to_string_lossy().to_string());
    }
    if let Some(path) = backup_existing_file(&quickmemory_file)? {
        backup_paths.push(path.to_string_lossy().to_string());
    }

    write_config_to_path(&config_file, &snapshot.keyboard_config)?;
    write_quickmemory_data_to_path(&quickmemory_file, &snapshot.quickmemory_data)?;

    Ok(CloudSyncRestoreResult {
        snapshot: CloudSyncSnapshotMeta {
            id: snapshot.id,
            schema_version: snapshot.schema_version,
            device_name: snapshot.device_name,
            app_version: snapshot.app_version,
            content_hash: snapshot.content_hash,
            created_at: snapshot.created_at,
        },
        backup_paths,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_base_url() {
        assert_eq!(
            normalize_base_url(" https://example.com/api/ ").expect("valid url"),
            "https://example.com/api"
        );
    }

    #[test]
    fn rejects_base_url_without_scheme() {
        assert!(normalize_base_url("example.com").is_err());
    }
}
