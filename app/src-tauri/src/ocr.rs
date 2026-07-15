// OCR engines: Windows uses Windows.Media.Ocr; macOS uses the built-in Vision framework.
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    pub id: usize,
    pub text: String,
    pub rect: OcrRect,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLayout {
    pub text: String,
    pub width: u32,
    pub height: u32,
    pub lines: Vec<OcrLine>,
}

#[tauri::command]
pub fn ocr_recognize_image(data: String) -> Result<String, String> {
    recognize_image_data(data)
}

#[tauri::command]
pub fn ocr_recognize_image_layout(data: String) -> Result<OcrLayout, String> {
    recognize_layout_data(data)
}

fn recognize_image_data(data: String) -> Result<String, String> {
    let text = recognize_layout_data(data)?.text;
    normalize_text_result(text)
}

fn normalize_text_result(text: String) -> Result<String, String> {
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

fn recognize_layout_data(data: String) -> Result<OcrLayout, String> {
    recognize_platform_layout(data)
}

#[cfg(target_os = "windows")]
fn recognize_platform_layout(data: String) -> Result<OcrLayout, String> {
    let text = recognize_windows_ocr(data)?;
    Ok(layout_from_plain_text(text))
}

#[cfg(target_os = "macos")]
fn recognize_platform_layout(data: String) -> Result<OcrLayout, String> {
    recognize_macos_vision_layout(data)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn recognize_platform_layout(_data: String) -> Result<OcrLayout, String> {
    Err("OCR is only supported on Windows and macOS".to_string())
}

#[cfg(target_os = "windows")]
fn layout_from_plain_text(text: String) -> OcrLayout {
    let normalized = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let lines = normalized
        .lines()
        .enumerate()
        .map(|(id, line)| OcrLine {
            id,
            text: line.to_string(),
            rect: OcrRect {
                x: 0.0,
                y: id as f64 * 24.0,
                width: 0.0,
                height: 22.0,
            },
        })
        .collect();
    OcrLayout {
        text: normalized,
        width: 0,
        height: 0,
        lines,
    }
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

#[cfg(target_os = "macos")]
fn recognize_macos_vision_layout(data: String) -> Result<OcrLayout, String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use image::GenericImageView;
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send, sel};
    use objc2_foundation::{NSArray, NSData, NSDictionary, NSError, NSRect, NSString};
    use std::ptr;

    #[link(name = "Vision", kind = "framework")]
    extern "C" {}

    let bytes = BASE64
        .decode(data.trim())
        .map_err(|e| format!("Failed to decode OCR image data: {e}"))?;
    let (image_width, image_height) = image::load_from_memory(&bytes)
        .map_err(|e| format!("Failed to inspect OCR image dimensions: {e}"))?
        .dimensions();

    let ns_data = NSData::with_bytes(&bytes);
    let options = NSDictionary::<NSString, AnyObject>::new();
    let request: *mut AnyObject = unsafe {
        let allocated: *mut AnyObject = msg_send![class!(VNRecognizeTextRequest), alloc];
        msg_send![allocated, init]
    };
    if request.is_null() {
        return Err("macOS Vision OCR request could not be created".to_string());
    }
    let request = unsafe { &*request };

    unsafe {
        // Accurate mode is required for Chinese recognition on older Vision revisions.
        let _: () = msg_send![request, setRecognitionLevel: 0usize];
        let _: () = msg_send![request, setUsesLanguageCorrection: true];
    }

    unsafe {
        let can_detect_language: bool =
            msg_send![request, respondsToSelector: sel!(setAutomaticallyDetectsLanguage:)];
        if can_detect_language {
            let _: () = msg_send![request, setAutomaticallyDetectsLanguage: true];
        }
    }

    let supported_languages = supported_macos_ocr_languages(request);
    let preferred_languages = ["zh-Hans", "zh-Hant", "en-US"];
    let enabled_language_values = preferred_languages
        .iter()
        .filter(|language| {
            supported_languages.is_empty()
                || supported_languages
                    .iter()
                    .any(|supported| supported.as_str() == **language)
        })
        .map(|language| NSString::from_str(language))
        .collect::<Vec<_>>();

    if !enabled_language_values.is_empty() {
        let enabled_language_refs = enabled_language_values
            .iter()
            .map(|language| &**language)
            .collect::<Vec<_>>();
        let languages = NSArray::from_slice(&enabled_language_refs);
        unsafe {
            let _: () = msg_send![request, setRecognitionLanguages: &*languages];
        }
    }

    let handler: *mut AnyObject = unsafe {
        let allocated: *mut AnyObject = msg_send![class!(VNImageRequestHandler), alloc];
        msg_send![
            allocated,
            initWithData: &*ns_data,
            options: &*options
        ]
    };
    if handler.is_null() {
        return Err("macOS Vision OCR image handler could not be created".to_string());
    }
    let handler = unsafe { &*handler };
    let requests = NSArray::from_slice(&[request]);
    let mut error: *mut NSError = ptr::null_mut();
    let ok: bool = unsafe {
        msg_send![
            handler,
            performRequests: &*requests,
            error: &mut error
        ]
    };

    if !ok {
        let detail = if error.is_null() {
            "unknown Vision error".to_string()
        } else {
            unsafe { (*error).localizedDescription().to_string() }
        };
        return Err(format!("macOS Vision OCR failed: {detail}"));
    }

    let observations: *mut NSArray<AnyObject> = unsafe { msg_send![request, results] };
    if observations.is_null() {
        return Ok(OcrLayout {
            text: String::new(),
            width: image_width,
            height: image_height,
            lines: Vec::new(),
        });
    }

    let observations = unsafe { &*observations };
    let mut lines = Vec::new();
    for (id, observation) in observations.iter().enumerate() {
        let bounding_box: NSRect = unsafe { msg_send![&*observation, boundingBox] };
        let candidates: *mut NSArray<AnyObject> =
            unsafe { msg_send![&*observation, topCandidates: 1usize] };
        if candidates.is_null() {
            continue;
        }
        let candidates = unsafe { &*candidates };
        if candidates.is_empty() {
            continue;
        }
        let candidate = unsafe { candidates.objectAtIndex_unchecked(0) };
        let recognized: *mut NSString = unsafe { msg_send![candidate, string] };
        if recognized.is_null() {
            continue;
        }
        let value = unsafe { &*recognized }.to_string();
        let value = value.trim();
        if !value.is_empty() {
            lines.push(OcrLine {
                id,
                text: value.to_string(),
                rect: vision_rect_to_image_rect(bounding_box, image_width, image_height),
            });
        }
    }

    let text = lines
        .iter()
        .map(|line| line.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(OcrLayout {
        text,
        width: image_width,
        height: image_height,
        lines,
    })
}

#[cfg(target_os = "macos")]
fn vision_rect_to_image_rect(rect: objc2_foundation::NSRect, width: u32, height: u32) -> OcrRect {
    let width = f64::from(width);
    let height = f64::from(height);
    let x = rect.origin.x * width;
    let y = (1.0 - rect.origin.y - rect.size.height) * height;
    OcrRect {
        x,
        y,
        width: rect.size.width * width,
        height: rect.size.height * height,
    }
}

#[cfg(target_os = "macos")]
fn supported_macos_ocr_languages(request: &objc2::runtime::AnyObject) -> Vec<String> {
    use objc2::{msg_send, sel};
    use objc2_foundation::{NSArray, NSError, NSString};
    use std::ptr;

    let can_query: bool = unsafe {
        msg_send![request, respondsToSelector: sel!(supportedRecognitionLanguagesAndReturnError:)]
    };
    if !can_query {
        return Vec::new();
    }

    let mut error: *mut NSError = ptr::null_mut();
    let languages: *mut NSArray<NSString> = unsafe {
        msg_send![
            request,
            supportedRecognitionLanguagesAndReturnError: &mut error
        ]
    };
    if languages.is_null() {
        return Vec::new();
    }

    unsafe { &*languages }
        .iter()
        .map(|language| language.to_string())
        .collect()
}
