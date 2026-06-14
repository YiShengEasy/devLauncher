// OCR MVP engine: Windows OCR API on Windows. Tesseract fallback is reserved for a separate implementation pass.

#[tauri::command]
pub fn ocr_recognize_image(data: String) -> Result<String, String> {
    recognize_image_data(data)
}

fn recognize_image_data(data: String) -> Result<String, String> {
    let text = recognize_windows_ocr(data)?;
    let normalized = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if normalized.is_empty() {
        Err("No text recognized".to_string())
    } else {
        Ok(normalized)
    }
}

#[cfg(not(target_os = "windows"))]
fn recognize_windows_ocr(_data: String) -> Result<String, String> {
    Err("OCR is only supported on Windows in this MVP".to_string())
}

#[cfg(target_os = "windows")]
fn recognize_windows_ocr(data: String) -> Result<String, String> {
    use std::fs;

    let image_path = write_image_data_to_temp_file(&data)?;
    let output = run_windows_ocr_powershell(&image_path);
    let _ = fs::remove_file(&image_path);
    output.map(|text| {
        text.replace("\r\n", "\n")
            .replace('\r', "\n")
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    })
}

#[cfg(target_os = "windows")]
fn write_image_data_to_temp_file(data: &str) -> Result<std::path::PathBuf, String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use std::{
        env, fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    let bytes = BASE64
        .decode(data.trim())
        .map_err(|e| format!("Failed to decode OCR image data: {e}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let path: PathBuf = env::temp_dir().join(format!(
        "devlauncher-ocr-screenshot-{}-{stamp}.jpg",
        std::process::id()
    ));
    fs::write(&path, bytes).map_err(|e| format!("Failed to write OCR screenshot image: {e}"))?;

    Ok(path)
}

#[cfg(target_os = "windows")]
fn run_windows_ocr_powershell(image_path: &std::path::Path) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use std::{
        process::{Command, Stdio},
        thread,
        time::Duration,
    };

    let script = r#"
$ErrorActionPreference = 'Stop'
$imagePath = $env:DEVLAUNCHER_OCR_IMAGE
if ([string]::IsNullOrWhiteSpace($imagePath)) {
  throw 'Missing OCR image path'
}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]

function AwaitWinRt($operation, [type] $resultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.IsGenericMethodDefinition -and
      $_.GetGenericArguments().Count -eq 1 -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1
  if ($null -eq $method) {
    throw 'Windows Runtime async bridge is unavailable'
  }
  $task = $method.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}

$file = AwaitWinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
$stream = AwaitWinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = AwaitWinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = AwaitWinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  throw 'Windows OCR engine is unavailable for the current user profile language'
}
$result = AwaitWinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$lines = @()
foreach ($line in $result.Lines) {
  if (-not [string]::IsNullOrWhiteSpace($line.Text)) {
    $lines += $line.Text.Trim()
  }
}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::Write(($lines -join "`n"))
"#;
    let encoded_script = BASE64.encode(
        script
            .encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect::<Vec<_>>(),
    );

    let mut child = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &encoded_script,
        ])
        .env("DEVLAUNCHER_OCR_IMAGE", image_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Windows OCR helper: {e}"))?;

    let timeout = Duration::from_secs(15);
    let started = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(100)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(
                    "Windows OCR invocation timed out while scanning the screenshot".to_string(),
                );
            }
            Err(e) => return Err(format!("Windows OCR helper failed: {e}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to read Windows OCR helper output: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let detail = if stderr.is_empty() {
            format!("exit code {:?}", output.status.code())
        } else {
            stderr
        };
        return Err(format!(
            "Windows OCR invocation failed while scanning the screenshot: {detail}"
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
