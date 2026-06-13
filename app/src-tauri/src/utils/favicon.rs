use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, io::Read, path::PathBuf};
use tauri::Manager;

#[derive(Debug, Deserialize)]
pub struct FaviconRequest {
    pub origin: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CachedFavicon {
    data_url: String,
}

fn cache_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("favicons.json")
}

fn normalize_origin(origin: &str) -> Option<String> {
    let origin = origin.trim().trim_end_matches('/');
    if origin.starts_with("https://")
        || origin.starts_with("http://localhost")
        || origin.starts_with("http://127.0.0.1")
        || origin.starts_with("http://[::1]")
    {
        Some(origin.to_string())
    } else {
        None
    }
}

fn load_cache(app: &tauri::AppHandle) -> HashMap<String, CachedFavicon> {
    let path = cache_path(app);
    let Ok(content) = fs::read_to_string(path) else {
        return HashMap::new();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_cache(app: &tauri::AppHandle, cache: &HashMap<String, CachedFavicon>) -> Result<(), String> {
    let path = cache_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(cache).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn content_type_to_mime(content_type: Option<&str>) -> &'static str {
    let content_type = content_type.unwrap_or("").to_ascii_lowercase();
    if content_type.contains("png") {
        "image/png"
    } else if content_type.contains("svg") {
        "image/svg+xml"
    } else if content_type.contains("webp") {
        "image/webp"
    } else if content_type.contains("jpeg") || content_type.contains("jpg") {
        "image/jpeg"
    } else {
        "image/x-icon"
    }
}

fn fetch_favicon(origin: &str) -> Result<String, String> {
    let url = format!("{}/favicon.ico", origin.trim_end_matches('/'));
    let response = ureq::get(&url)
        .timeout(std::time::Duration::from_secs(3))
        .call()
        .map_err(|e| e.to_string())?;
    let mime = content_type_to_mime(response.header("content-type"));
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(512 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Err("empty favicon".to_string());
    }
    Ok(format!("data:{};base64,{}", mime, BASE64.encode(bytes)))
}

fn cached_favicons(
    app: &tauri::AppHandle,
    requests: Vec<FaviconRequest>,
) -> HashMap<String, String> {
    let cache = load_cache(app);
    let mut result = HashMap::new();

    for request in requests {
        let Some(origin) = normalize_origin(&request.origin) else {
            continue;
        };
        if let Some(cached) = cache.get(&origin) {
            result.insert(origin, cached.data_url.clone());
        }
    }

    result
}

fn fetch_missing_favicons(
    app: &tauri::AppHandle,
    requests: Vec<FaviconRequest>,
) -> HashMap<String, String> {
    let mut cache = load_cache(app);
    let mut result = HashMap::new();
    let mut changed = false;

    for request in requests {
        let Some(origin) = normalize_origin(&request.origin) else {
            continue;
        };
        if let Some(cached) = cache.get(&origin) {
            result.insert(origin.clone(), cached.data_url.clone());
            continue;
        }
        if let Ok(data_url) = fetch_favicon(&origin) {
            cache.insert(
                origin.clone(),
                CachedFavicon {
                    data_url: data_url.clone(),
                },
            );
            result.insert(origin, data_url);
            changed = true;
        }
    }

    if changed {
        let _ = save_cache(app, &cache);
    }
    result
}

#[tauri::command]
pub fn get_cached_favicons(
    app: tauri::AppHandle,
    requests: Vec<FaviconRequest>,
) -> Result<HashMap<String, String>, String> {
    Ok(cached_favicons(&app, requests))
}

#[tauri::command]
pub async fn refresh_favicons(
    app: tauri::AppHandle,
    requests: Vec<FaviconRequest>,
) -> Result<HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_missing_favicons(&app, requests))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_favicons(
    app: tauri::AppHandle,
    requests: Vec<FaviconRequest>,
) -> Result<HashMap<String, String>, String> {
    refresh_favicons(app, requests).await
}
