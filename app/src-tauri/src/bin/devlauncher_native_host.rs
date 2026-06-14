use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct NativeRequest {
    #[serde(rename = "type")]
    request_type: String,
    origin: Option<String>,
}

#[derive(Debug, Serialize)]
struct CredentialResponse {
    ok: bool,
    credentials: Vec<WebCredential>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebCredential {
    username: String,
    password: String,
    auto_submit: bool,
    username_selector: Option<String>,
    password_selector: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawConfig {
    pages: Vec<RawPage>,
}

#[derive(Debug, Deserialize)]
struct RawPage {
    keys: HashMap<String, serde_yaml::Value>,
}

fn read_native_message() -> Result<Option<NativeRequest>, String> {
    let mut len_buf = [0u8; 4];
    match std::io::stdin().read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.to_string()),
    }
    let len = u32::from_ne_bytes(len_buf) as usize;
    if len == 0 || len > 64 * 1024 * 1024 {
        return Err("invalid native message size".to_string());
    }
    let mut buf = vec![0u8; len];
    std::io::stdin()
        .read_exact(&mut buf)
        .map_err(|e| e.to_string())?;
    serde_json::from_slice(&buf)
        .map(Some)
        .map_err(|e| e.to_string())
}

fn write_native_message(value: &serde_json::Value) -> Result<(), String> {
    let body = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    let len = (body.len() as u32).to_ne_bytes();
    let mut stdout = std::io::stdout();
    stdout.write_all(&len).map_err(|e| e.to_string())?;
    stdout.write_all(&body).map_err(|e| e.to_string())?;
    stdout.flush().map_err(|e| e.to_string())
}

fn config_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(path) = std::env::var("DEVLAUNCHER_CONFIG_PATH") {
        paths.push(PathBuf::from(path));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        paths.push(
            PathBuf::from(&appdata)
                .join("com.yisheng.app")
                .join("keyboard.yaml"),
        );
        paths.push(
            PathBuf::from(&appdata)
                .join("DevLauncher")
                .join("keyboard.yaml"),
        );
    }
    paths
}

fn load_config() -> Result<RawConfig, String> {
    for path in config_candidates() {
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            return serde_yaml::from_str(&content).map_err(|e| e.to_string());
        }
    }
    Ok(RawConfig { pages: Vec::new() })
}

fn extract_origin(url: &str) -> Option<String> {
    let value = url.trim();
    let scheme_end = value.find("://")?;
    let scheme = &value[..scheme_end];
    if scheme != "https" && scheme != "http" {
        return None;
    }
    let rest = &value[scheme_end + 3..];
    let host_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let host = &rest[..host_end];
    if host.is_empty() {
        return None;
    }
    Some(
        format!("{}://{}", scheme, host)
            .trim_end_matches('/')
            .to_string(),
    )
}

fn is_allowed_web_origin(origin: &str) -> bool {
    let origin = origin.trim().to_ascii_lowercase();
    origin.starts_with("https://")
        || origin == "http://localhost"
        || origin.starts_with("http://localhost:")
        || origin == "http://127.0.0.1"
        || origin.starts_with("http://127.0.0.1:")
        || origin == "http://[::1]"
        || origin.starts_with("http://[::1]:")
}

fn web_password_key(origin: &str, username: &str) -> Result<String, String> {
    let origin = origin.trim().trim_end_matches('/');
    let username = username.trim();
    if origin.is_empty() || username.is_empty() {
        return Err("missing origin or username".to_string());
    }
    if !is_allowed_web_origin(origin) {
        return Err("web passwords require HTTPS, except localhost".to_string());
    }
    Ok(format!("web:{}:{}", origin, username))
}

fn string_field(value: &serde_yaml::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn bool_field(value: &serde_yaml::Value, key: &str) -> bool {
    value.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn get_credentials(origin: &str) -> Result<Vec<WebCredential>, String> {
    if !is_allowed_web_origin(origin) {
        return Ok(Vec::new());
    }
    let config = load_config()?;
    let mut credentials = Vec::new();

    for page in config.pages {
        for action in page.keys.values() {
            if string_field(action, "type").as_deref() != Some("url") {
                continue;
            }
            if !bool_field(action, "autofill") || !bool_field(action, "hasPassword") {
                continue;
            }
            let Some(target) = string_field(action, "target") else {
                continue;
            };
            if extract_origin(&target).as_deref() != Some(origin) {
                continue;
            }
            let Some(username) = string_field(action, "username") else {
                continue;
            };
            let key = web_password_key(origin, &username)?;
            let Some(password) = keyring::Entry::new("DevLauncher", &key)
                .ok()
                .and_then(|entry| entry.get_password().ok())
            else {
                continue;
            };
            credentials.push(WebCredential {
                username,
                password,
                auto_submit: bool_field(action, "autoSubmit"),
                username_selector: string_field(action, "usernameSelector"),
                password_selector: string_field(action, "passwordSelector"),
            });
        }
    }

    Ok(credentials)
}

fn handle_request(request: NativeRequest) -> serde_json::Value {
    if request.request_type != "getCredentials" {
        return json!({ "ok": false, "credentials": [], "error": "unsupported request" });
    }
    let Some(origin) = request.origin else {
        return json!({ "ok": false, "credentials": [], "error": "missing origin" });
    };
    match get_credentials(origin.trim().trim_end_matches('/')) {
        Ok(credentials) => serde_json::to_value(CredentialResponse {
            ok: true,
            credentials,
            error: None,
        })
        .unwrap_or_else(
            |_| json!({ "ok": false, "credentials": [], "error": "serialization failed" }),
        ),
        Err(error) => json!({ "ok": false, "credentials": [], "error": error }),
    }
}

fn main() {
    let response = match read_native_message() {
        Ok(Some(request)) => handle_request(request),
        Ok(None) => json!({ "ok": false, "credentials": [], "error": "empty request" }),
        Err(error) => json!({ "ok": false, "credentials": [], "error": error }),
    };

    let _ = write_native_message(&response);
}
