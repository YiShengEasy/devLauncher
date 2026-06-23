# Video Frame Sampler

Video Frame Sampler creates a short MP4 preview from a local video by sampling frames at a fixed interval.

- Processes videos locally; the source file is not uploaded.
- Requires system FFmpeg and ffprobe. On macOS, install with `brew install ffmpeg`.
- Defaults to starting at `00:00:00`, sampling every `5s`, and displaying each sampled frame for `0.5s`.
- Can optionally keep the extracted JPG frames next to the generated MP4.

This plugin is best for turning long recordings into quick review videos.
