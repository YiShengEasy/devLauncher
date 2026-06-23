use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const TRUSTED_PLUGIN_ID: &str = "devlauncher.tools.video-frame-sampler";
const PROGRESS_EVENT: &str = "video-frame-sampler://progress";
const COMPLETED_EVENT: &str = "video-frame-sampler://completed";
const FAILED_EVENT: &str = "video-frame-sampler://failed";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoProbeRequest {
    pub plugin_id: String,
    pub input_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoProbeResult {
    pub duration_seconds: f64,
    pub width: u32,
    pub height: u32,
    pub fps: Option<f64>,
    pub has_audio: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameSampleRequest {
    pub plugin_id: String,
    pub input_path: String,
    pub output_dir: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub sample_interval_seconds: f64,
    pub frame_display_seconds: f64,
    pub keep_frames: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FrameSampleResult {
    pub output_video_path: String,
    pub frames_dir: Option<String>,
    pub sampled_frame_count: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VideoProgressEvent {
    phase: String,
    message: String,
    progress: f64,
}

pub(crate) struct VideoToolState {
    active_child: Arc<Mutex<Option<Child>>>,
    cancel_requested: AtomicBool,
}

pub fn setup(app: &mut tauri::App) {
    app.manage(VideoToolState {
        active_child: Arc::new(Mutex::new(None)),
        cancel_requested: AtomicBool::new(false),
    });
}

fn ensure_trusted_plugin(plugin_id: &str) -> Result<(), String> {
    if plugin_id == TRUSTED_PLUGIN_ID {
        Ok(())
    } else {
        Err("video tools are only available to the first-party video frame sampler plugin".into())
    }
}

fn command_exists(path: &Path) -> bool {
    Command::new(path)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn find_tool(name: &str) -> Result<PathBuf, String> {
    let mut candidates = vec![PathBuf::from(name)];
    candidates.push(PathBuf::from(format!("/opt/homebrew/bin/{name}")));
    candidates.push(PathBuf::from(format!("/usr/local/bin/{name}")));

    candidates
        .into_iter()
        .find(|candidate| command_exists(candidate))
        .ok_or_else(|| {
            format!(
                "{name} was not found. Install FFmpeg with `brew install ffmpeg` and try again."
            )
        })
}

fn parse_time_seconds(input: &str) -> Result<f64, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("time cannot be empty".into());
    }

    let parts: Vec<&str> = trimmed.split(':').collect();
    if parts.len() > 3 {
        return Err("time must be seconds, MM:SS, or HH:MM:SS".into());
    }

    let mut total = 0.0;
    for part in parts {
        if part.trim().is_empty() {
            return Err("time contains an empty segment".into());
        }
        let value: f64 = part
            .parse()
            .map_err(|_| "time contains a non-numeric segment".to_string())?;
        if !value.is_finite() || value < 0.0 {
            return Err("time cannot be negative".into());
        }
        total = total * 60.0 + value;
    }

    Ok(total)
}

fn format_seconds(seconds: f64) -> String {
    format!("{seconds:.3}")
}

fn parse_rate(value: &str) -> Option<f64> {
    if let Some((left, right)) = value.split_once('/') {
        let numerator: f64 = left.parse().ok()?;
        let denominator: f64 = right.parse().ok()?;
        if denominator > 0.0 {
            return Some(numerator / denominator);
        }
        return None;
    }
    value.parse().ok()
}

fn validate_existing_file(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("input video does not exist".into());
    }
    Ok(path)
}

fn validate_output_dir(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    if !path.is_dir() {
        return Err("output path is not a directory".into());
    }
    Ok(path)
}

fn output_stem(input_path: &Path) -> String {
    let stem = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("video");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("{stem}-sampled-{now}")
}

fn build_extract_args(
    input_path: &Path,
    frame_pattern: &Path,
    start_time: &str,
    duration_seconds: Option<f64>,
    sample_interval_seconds: f64,
) -> Vec<String> {
    let mut args = vec![
        "-hide_banner".into(),
        "-y".into(),
        "-ss".into(),
        start_time.into(),
        "-i".into(),
        input_path.to_string_lossy().to_string(),
    ];
    if let Some(duration) = duration_seconds {
        args.push("-t".into());
        args.push(format_seconds(duration));
    }
    args.extend([
        "-vf".into(),
        format!("fps=1/{sample_interval_seconds}"),
        frame_pattern.to_string_lossy().to_string(),
    ]);
    args
}

fn build_assemble_args(
    frame_pattern: &Path,
    output_video_path: &Path,
    frame_display_seconds: f64,
) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-y".into(),
        "-framerate".into(),
        format_seconds(1.0 / frame_display_seconds),
        "-i".into(),
        frame_pattern.to_string_lossy().to_string(),
        "-c:v".into(),
        "libx264".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-an".into(),
        output_video_path.to_string_lossy().to_string(),
    ]
}

fn emit_progress(app: &tauri::AppHandle, phase: &str, message: &str, progress: f64) {
    let _ = app.emit(
        PROGRESS_EVENT,
        VideoProgressEvent {
            phase: phase.into(),
            message: message.into(),
            progress,
        },
    );
}

fn run_child(
    app: &tauri::AppHandle,
    state: &VideoToolState,
    mut command: Command,
    phase: &str,
    start_progress: f64,
    end_progress: f64,
) -> Result<(), String> {
    command.stdout(Stdio::null()).stderr(Stdio::null());
    let child = command.spawn().map_err(|e| e.to_string())?;
    {
        let mut active = state.active_child.lock().map_err(|e| e.to_string())?;
        *active = Some(child);
    }

    loop {
        if state.cancel_requested.load(Ordering::SeqCst) {
            let mut active = state.active_child.lock().map_err(|e| e.to_string())?;
            if let Some(child) = active.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
            *active = None;
            return Err("cancelled".into());
        }

        let maybe_status = {
            let mut active = state.active_child.lock().map_err(|e| e.to_string())?;
            let Some(child) = active.as_mut() else {
                return Err("video process is not running".into());
            };
            child.try_wait().map_err(|e| e.to_string())?
        };

        if let Some(status) = maybe_status {
            let mut active = state.active_child.lock().map_err(|e| e.to_string())?;
            *active = None;
            if status.success() {
                emit_progress(app, phase, "phase completed", end_progress);
                return Ok(());
            }
            return Err(format!("{phase} failed with status {status}"));
        }

        emit_progress(
            app,
            phase,
            "processing",
            (start_progress + end_progress) / 2.0,
        );
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}

#[tauri::command]
pub fn probe_video(request: VideoProbeRequest) -> Result<VideoProbeResult, String> {
    ensure_trusted_plugin(&request.plugin_id)?;
    let input_path = validate_existing_file(&request.input_path)?;
    let ffprobe = find_tool("ffprobe")?;
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,width,height,avg_frame_rate",
            "-of",
            "json",
        ])
        .arg(&input_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let value: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    let duration_seconds = value["format"]["duration"]
        .as_str()
        .ok_or_else(|| "ffprobe did not return video duration".to_string())?
        .parse::<f64>()
        .map_err(|_| "ffprobe returned an invalid duration".to_string())?;

    let streams = value["streams"]
        .as_array()
        .ok_or_else(|| "ffprobe did not return stream metadata".to_string())?;
    let video_stream = streams
        .iter()
        .find(|stream| stream["codec_type"].as_str() == Some("video"))
        .ok_or_else(|| "no video stream found".to_string())?;

    Ok(VideoProbeResult {
        duration_seconds,
        width: video_stream["width"].as_u64().unwrap_or(0) as u32,
        height: video_stream["height"].as_u64().unwrap_or(0) as u32,
        fps: video_stream["avg_frame_rate"].as_str().and_then(parse_rate),
        has_audio: streams
            .iter()
            .any(|stream| stream["codec_type"].as_str() == Some("audio")),
    })
}

#[tauri::command]
pub fn sample_video_frames(
    app: tauri::AppHandle,
    state: tauri::State<VideoToolState>,
    request: FrameSampleRequest,
) -> Result<FrameSampleResult, String> {
    ensure_trusted_plugin(&request.plugin_id)?;
    let input_path = validate_existing_file(&request.input_path)?;
    let output_dir = validate_output_dir(&request.output_dir)?;
    if request.sample_interval_seconds <= 0.0 || !request.sample_interval_seconds.is_finite() {
        return Err("sample interval must be greater than 0".into());
    }
    if request.frame_display_seconds <= 0.0 || !request.frame_display_seconds.is_finite() {
        return Err("frame display duration must be greater than 0".into());
    }

    let start_seconds = parse_time_seconds(&request.start_time)?;
    let duration_seconds = match request
        .end_time
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        Some(end_time) => {
            let end_seconds = parse_time_seconds(end_time)?;
            if end_seconds <= start_seconds {
                return Err("end time must be after start time".into());
            }
            Some(end_seconds - start_seconds)
        }
        None => None,
    };

    state.cancel_requested.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg")?;
    let stem = output_stem(&input_path);
    let frames_dir = output_dir.join(format!("{stem}-frames"));
    if frames_dir.exists() {
        fs::remove_dir_all(&frames_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&frames_dir).map_err(|e| e.to_string())?;
    let frame_pattern = frames_dir.join("frame_%05d.jpg");
    let output_video_path = output_dir.join(format!("{stem}.mp4"));

    emit_progress(&app, "extract", "extracting sampled frames", 0.05);
    let mut extract = Command::new(&ffmpeg);
    extract.args(build_extract_args(
        &input_path,
        &frame_pattern,
        &request.start_time,
        duration_seconds,
        request.sample_interval_seconds,
    ));
    let result = run_child(&app, &state, extract, "extract", 0.05, 0.62);
    if let Err(err) = result {
        let _ = app.emit(FAILED_EVENT, &err);
        let _ = fs::remove_dir_all(&frames_dir);
        return Err(err);
    }

    let sampled_frame_count = fs::read_dir(&frames_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("jpg"))
                .unwrap_or(false)
        })
        .count() as u32;
    if sampled_frame_count == 0 {
        let _ = fs::remove_dir_all(&frames_dir);
        return Err("no frames were sampled from the selected range".into());
    }

    emit_progress(&app, "assemble", "assembling preview video", 0.68);
    let mut assemble = Command::new(&ffmpeg);
    assemble.args(build_assemble_args(
        &frame_pattern,
        &output_video_path,
        request.frame_display_seconds,
    ));
    let result = run_child(&app, &state, assemble, "assemble", 0.68, 1.0);
    if let Err(err) = result {
        let _ = app.emit(FAILED_EVENT, &err);
        if !request.keep_frames {
            let _ = fs::remove_dir_all(&frames_dir);
        }
        return Err(err);
    }

    let frames_dir_result = if request.keep_frames {
        Some(frames_dir.to_string_lossy().to_string())
    } else {
        fs::remove_dir_all(&frames_dir).map_err(|e| e.to_string())?;
        None
    };

    let result = FrameSampleResult {
        output_video_path: output_video_path.to_string_lossy().to_string(),
        frames_dir: frames_dir_result,
        sampled_frame_count,
    };
    let _ = app.emit(COMPLETED_EVENT, result.clone());
    Ok(result)
}

#[tauri::command]
pub fn cancel_video_frame_sampler(
    state: tauri::State<VideoToolState>,
    plugin_id: String,
) -> Result<(), String> {
    ensure_trusted_plugin(&plugin_id)?;
    state.cancel_requested.store(true, Ordering::SeqCst);
    let mut active = state.active_child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = active.as_mut() {
        let _ = child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn open_video_tool_path(plugin_id: String, path: String) -> Result<(), String> {
    ensure_trusted_plugin(&plugin_id)?;
    open::that(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_time_formats() {
        assert_eq!(parse_time_seconds("00:30:00").unwrap(), 1800.0);
        assert_eq!(parse_time_seconds("30:00").unwrap(), 1800.0);
        assert_eq!(parse_time_seconds("90").unwrap(), 90.0);
        assert!(parse_time_seconds("not-time").is_err());
    }

    #[test]
    fn rejects_end_time_before_start() {
        let start = parse_time_seconds("00:30:00").unwrap();
        let end = parse_time_seconds("00:29:59").unwrap();
        assert!(end <= start);
    }

    #[test]
    fn parses_fractional_frame_rates() {
        assert_eq!(parse_rate("30/1"), Some(30.0));
        let ntsc = parse_rate("30000/1001").unwrap();
        assert!((ntsc - 29.970).abs() < 0.01);
        assert_eq!(parse_rate("0/0"), None);
    }

    #[test]
    fn builds_extract_args_with_start_only() {
        let args = build_extract_args(
            Path::new("/tmp/input.mp4"),
            Path::new("/tmp/frames/frame_%05d.jpg"),
            "00:30:00",
            None,
            5.0,
        );

        assert_eq!(
            args,
            vec![
                "-hide_banner",
                "-y",
                "-ss",
                "00:30:00",
                "-i",
                "/tmp/input.mp4",
                "-vf",
                "fps=1/5",
                "/tmp/frames/frame_%05d.jpg",
            ]
        );
    }

    #[test]
    fn builds_extract_args_with_start_and_end_duration() {
        let args = build_extract_args(
            Path::new("/tmp/input.mp4"),
            Path::new("/tmp/frames/frame_%05d.jpg"),
            "00:00:05",
            Some(10.0),
            5.0,
        );

        assert!(args.windows(2).any(|pair| pair == ["-t", "10.000"]));
        assert!(args.windows(2).any(|pair| pair == ["-vf", "fps=1/5"]));
    }

    #[test]
    fn builds_assemble_args_for_half_second_frames() {
        let args = build_assemble_args(
            Path::new("/tmp/frames/frame_%05d.jpg"),
            Path::new("/tmp/output.mp4"),
            0.5,
        );

        assert_eq!(
            args,
            vec![
                "-hide_banner",
                "-y",
                "-framerate",
                "2.000",
                "-i",
                "/tmp/frames/frame_%05d.jpg",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-an",
                "/tmp/output.mp4",
            ]
        );
    }
}
