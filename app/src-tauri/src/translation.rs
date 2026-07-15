use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranslateHelperResponse {
    source_language: Option<String>,
    target_language: Option<String>,
    source_text: Option<String>,
    target_text: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateResponse {
    pub source_language: String,
    pub target_language: String,
    pub source_text: String,
    pub target_text: String,
}

#[tauri::command]
pub fn translate_text(text: String, target_language: String) -> Result<TranslateResponse, String> {
    translate_text_platform(text, target_language)
}

#[cfg(target_os = "macos")]
fn translate_text_platform(
    text: String,
    target_language: String,
) -> Result<TranslateResponse, String> {
    use serde_json::json;
    use std::fs;
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    const HELPER: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/devlauncher_translate_helper"));

    let helper_path = std::env::temp_dir().join(format!(
        "devlauncher-translate-helper-{}",
        std::process::id()
    ));
    fs::write(&helper_path, HELPER)
        .map_err(|e| format!("failed to write translate helper: {e}"))?;
    let mut permissions = fs::metadata(&helper_path)
        .map_err(|e| format!("failed to inspect translate helper: {e}"))?
        .permissions();
    permissions.set_mode(0o700);
    fs::set_permissions(&helper_path, permissions)
        .map_err(|e| format!("failed to prepare translate helper: {e}"))?;

    let payload = json!({
        "text": text,
        "targetLanguage": target_language,
    })
    .to_string();

    let mut child = Command::new(&helper_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start macOS translation helper: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.as_bytes())
            .map_err(|e| format!("failed to send translation request: {e}"))?;
    }

    let started_at = Instant::now();
    let output = loop {
        match child
            .try_wait()
            .map_err(|e| format!("failed to poll translation helper: {e}"))?
        {
            Some(_) => {
                break child
                    .wait_with_output()
                    .map_err(|e| format!("failed to read translation helper output: {e}"))?;
            }
            None if started_at.elapsed() >= Duration::from_secs(20) => {
                let _ = child.kill();
                let _ = child.wait_with_output();
                let _ = fs::remove_file(&helper_path);
                return Err("TRANSLATION_TIMEOUT".to_string());
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    };
    let _ = fs::remove_file(&helper_path);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let helper_response: TranslateHelperResponse =
        serde_json::from_str(stdout.trim()).map_err(|e| {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if stderr.is_empty() {
                format!("invalid translation helper response: {e}")
            } else {
                format!("invalid translation helper response: {e}; {stderr}")
            }
        })?;

    if !output.status.success() {
        return Err(helper_response
            .error
            .unwrap_or_else(|| "macOS system translation failed".to_string()));
    }

    Ok(TranslateResponse {
        source_language: helper_response.source_language.unwrap_or_default(),
        target_language: helper_response.target_language.unwrap_or_default(),
        source_text: helper_response.source_text.unwrap_or_default(),
        target_text: helper_response.target_text.unwrap_or_default(),
    })
}

#[cfg(not(target_os = "macos"))]
fn translate_text_platform(
    _text: String,
    _target_language: String,
) -> Result<TranslateResponse, String> {
    Err("system translation is only supported on macOS".to_string())
}
