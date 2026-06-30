# Video Frame Sampler Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a DevLauncher marketplace plugin that lets users select a local video, sample frames at a fixed interval from a start/end time range, and generate a new local MP4 preview video without uploading the source video.

**Architecture:** Ship the feature as a static WebView plugin package listed in the DevLauncher marketplace. The plugin UI runs in the existing plugin host. Heavy video processing runs through DevLauncher-owned native commands that invoke a local FFmpeg binary, stream progress back to the UI, and write outputs to a user-selected local folder. The source video stays on the user's machine.

**Tech Stack:** DevLauncher static WebView plugin, Tauri 2 commands/events, React/TypeScript plugin UI, Rust command wrapper, FFmpeg/ffprobe, marketplace static JSON.

---

## Scope Check

This plan extends the static WebView plugin market model from `docs/superpowers/plans/2026-06-21-webview-plugin-market.md`.

It implements a first-party/local tool plugin named `Video Frame Sampler`. It does not implement cloud video upload, server-side processing, timeline editing, speech/audio extraction, AI video understanding, or a general video editor.

## Product Decisions

- Videos are processed locally. The plugin must not upload video files.
- First version depends on system FFmpeg. If FFmpeg is missing, show installation guidance.
- Default preset matches the current user need:
  - start time: `00:30:00`
  - end time: empty, meaning until video end
  - sample interval: `5s`
  - output frame display duration: `0.5s`
  - output format: `mp4`
  - audio: disabled
- Output includes one generated MP4 and optional extracted frame images only when the user enables "keep frames".
- The plugin should estimate frame count before running.

## File Structure

- Create `marketplace/plugins/video-frame-sampler/README.md`: Marketplace-facing plugin description.
- Create `marketplace/icons/video-frame-sampler.svg`: Marketplace icon.
- Create `examples/plugins/video-frame-sampler/plugin.json`: Plugin manifest fixture.
- Create `examples/plugins/video-frame-sampler/dist/index.html`: Static plugin UI entry.
- Create `examples/plugins/video-frame-sampler/src/`: Plugin UI source if the repo uses a build step for example plugins.
- Modify `marketplace/marketplace.json`: Add the plugin entry after release packaging.
- Modify `app/src-tauri/src/lib.rs`: Register video processing commands and event handling.
- Create `app/src-tauri/src/video_tools.rs`: FFmpeg detection, ffprobe metadata, command construction, process execution, cancellation, and progress parsing.
- Modify `app/src-tauri/Cargo.toml`: Add any small dependencies needed for safe temp dirs/path handling if existing dependencies are insufficient.
- Create `app/src/plugins/capabilities.ts` or extend existing plugin API layer if the plugin host already has a capability bridge.
- Modify `app/src/plugins/PluginHostApp.tsx`: Expose only approved video tool commands to this first-party plugin, if command access is not already routed.
- Create tests for command argument construction and time parsing.

## Task 1: Confirm Plugin Capability Boundary

**Files:**
- Inspect: `app/src/plugins/PluginHostApp.tsx`
- Inspect: `app/src/plugins/api.ts`
- Inspect: `app/src-tauri/src/plugin_manager.rs`
- Inspect: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Map current plugin host permissions**

Check whether static WebView plugins can call Tauri commands directly, whether they are isolated by origin, and how `PluginHostApp` passes plugin/action identity.

- [ ] **Step 2: Choose a first-party capability gate**

For the MVP, allow video commands only for a trusted first-party plugin id:

```text
devlauncher.tools.video-frame-sampler
```

Do not expose arbitrary shell execution to marketplace plugins.

- [ ] **Step 3: Document the boundary**

Add a short note near the capability bridge explaining that the plugin receives video processing commands, not generic process execution.

## Task 2: Add Native Video Tool Commands

**Files:**
- Create: `app/src-tauri/src/video_tools.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add request/response types**

Define Rust structs:

```rust
struct VideoProbeRequest {
    input_path: String,
}

struct VideoProbeResult {
    duration_seconds: f64,
    width: u32,
    height: u32,
    fps: Option<f64>,
    has_audio: bool,
}

struct FrameSampleRequest {
    input_path: String,
    output_dir: String,
    start_time: String,
    end_time: Option<String>,
    sample_interval_seconds: f64,
    frame_display_seconds: f64,
    keep_frames: bool,
}

struct FrameSampleResult {
    output_video_path: String,
    frames_dir: Option<String>,
    sampled_frame_count: u32,
}
```

- [ ] **Step 2: Detect FFmpeg**

Implement:

```text
find_ffmpeg()
find_ffprobe()
```

Search common locations:

- `ffmpeg` and `ffprobe` from `PATH`
- `/opt/homebrew/bin/ffmpeg`
- `/usr/local/bin/ffmpeg`

Return a clear error if missing.

- [ ] **Step 3: Probe video metadata**

Run `ffprobe` with JSON output and parse duration, dimensions, fps, and audio stream presence.

- [ ] **Step 4: Generate FFmpeg commands safely**

Use structured `Command::new(ffmpeg).args([...])`. Do not build shell strings.

Frame extraction command shape:

```bash
ffmpeg -hide_banner -y -ss 00:30:00 -i input.mp4 -vf fps=1/5 frames/frame_%05d.jpg
```

If an end time exists, use `-t` duration computed from `end - start`.

Video assembly command shape:

```bash
ffmpeg -hide_banner -y -framerate 2 -i frames/frame_%05d.jpg -c:v libx264 -pix_fmt yuv420p output.mp4
```

`framerate = 1 / frame_display_seconds`.

- [ ] **Step 5: Parse progress**

Use FFmpeg `-progress pipe:1` where practical. Emit Tauri events such as:

```text
video-frame-sampler://progress
video-frame-sampler://completed
video-frame-sampler://failed
```

- [ ] **Step 6: Add cancellation**

Track the child process for the active job and expose a cancel command. Ensure temp frames are cleaned up unless `keep_frames` is enabled.

## Task 3: Build The Plugin UI

**Files:**
- Create: `examples/plugins/video-frame-sampler/plugin.json`
- Create: `examples/plugins/video-frame-sampler/dist/index.html`
- Optional create: `examples/plugins/video-frame-sampler/src/*`

- [ ] **Step 1: Add manifest**

Create manifest:

```json
{
  "id": "devlauncher.tools.video-frame-sampler",
  "name": "Video Frame Sampler",
  "version": "1.0.0",
  "kind": "webview",
  "description": "Sample local video frames and generate a quick MP4 preview without uploading files.",
  "entry": "dist/index.html",
  "icon": "icon.svg",
  "actions": [
    {
      "id": "open",
      "title": "Open Video Frame Sampler",
      "type": "webview"
    }
  ]
}
```

- [ ] **Step 2: Design the main screen**

Controls:

- Select video
- Start time
- End time
- Sample every N seconds
- Each sampled frame displays for N seconds
- Keep extracted frames toggle
- Output folder
- Generate
- Cancel
- Open output folder

- [ ] **Step 3: Add estimates**

After probing video metadata, show:

- video duration
- resolution
- estimated sampled frames
- estimated output duration

Formula:

```text
sampled frames = ceil(selected_duration / sample_interval_seconds)
output duration = sampled_frames * frame_display_seconds
```

- [ ] **Step 4: Add states**

Implement clear states:

- FFmpeg missing
- No video selected
- Ready
- Running
- Completed
- Failed
- Cancelled

## Task 4: Marketplace Packaging

**Files:**
- Create: `marketplace/plugins/video-frame-sampler/README.md`
- Create: `marketplace/icons/video-frame-sampler.svg`
- Modify: `marketplace/marketplace.json`
- Create release zip under the marketplace release flow already used for `hello-webview`

- [ ] **Step 1: Package plugin zip**

Zip structure:

```text
video-frame-sampler-1.0.0.zip
  plugin.json
  README.md
  icon.svg
  dist/
    index.html
```

- [ ] **Step 2: Compute sha256**

Compute the zip hash and add it to `marketplace/marketplace.json`.

- [ ] **Step 3: Add marketplace copy**

Mention:

- Local-only processing
- Requires FFmpeg
- No video upload
- Best for quick review videos from long recordings

## Task 5: Verification

- [ ] **Step 1: Unit test time parsing**

Cases:

- `00:30:00`
- `30:00`
- `90`
- invalid text
- end time before start time

- [ ] **Step 2: Unit test FFmpeg argument construction**

Verify command args for:

- start only
- start + end
- interval 5 seconds
- frame display 0.5 seconds
- keep frames on/off

- [ ] **Step 3: Manual test with a short fixture video**

Use a 20 second local test video:

```text
start: 00:00:05
end: 00:00:15
sample interval: 5s
frame display: 0.5s
```

Expected:

- 2 frames sampled
- output video approximately 1 second
- no audio track

- [ ] **Step 4: Manual test with the user's real workflow**

Use a long local video:

```text
start: 00:30:00
end: until end
sample interval: 5s
frame display: 0.5s
```

Expected:

- processing stays local
- progress is visible
- output MP4 opens successfully

## Task 6: Future Enhancements

- Bundle FFmpeg for a zero-setup plugin install.
- Add GIF export.
- Add contact sheet export.
- Add timestamp watermark.
- Add batch processing.
- Add preview thumbnails before generation.
- Add preset saving.
- Add drag-and-drop video selection.

## Security And Privacy Notes

- Never upload the video.
- Never expose generic shell execution to plugins.
- Validate all input and output paths.
- Prefer user-selected output directories.
- Clean temp files by default.
- Keep FFmpeg invocation as structured process args, not shell strings.

## Done Definition

- Plugin can be installed from the DevLauncher plugin market.
- User can select a local video and generate a sampled MP4.
- Default values match the 30-minute / every-5-seconds workflow.
- Missing FFmpeg produces a helpful error.
- Source video never leaves the machine.
- Tests cover time parsing and command construction.
