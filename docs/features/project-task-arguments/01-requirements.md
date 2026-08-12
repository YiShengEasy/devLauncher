# Project Task Arguments Requirements

## Goal

Allow a discovered task to run with reusable argument presets such as
`--check` or `--watch --port 3000` without editing the project task source.

## Required Behavior

- Show an argument editor below the resolved command preview.
- Parse spaces, quotes, empty quoted values, and escaped spaces as arguments.
- Keep the original discovered task command in the preview and append the
  entered argument text only when it is non-empty.
- Keep backend working-directory and runner wrappers out of the main preview.
- Save argument presets independently by project ID, provider, and task source key.
- Show the most recently used preset first.
- Allow choosing and deleting a saved preset.
- Remember a non-empty preset after either explicit save or successful dispatch.
- Keep at most 12 presets per task and 200 presets in total.
- Preserve task execution without arguments and existing workflow behavior.

## Execution Rules

- Package scripts use the package manager's `run <script> -- <arguments>` form.
- Markdown tasks are re-read and revalidated by the Rust backend before arguments
  are appended to the declared command. Execution does not add a `runme run`
  wrapper.
- Every parsed argument is shell-quoted by the backend.
- Newlines, null bytes, excessive argument counts, and oversized values are
  rejected.

## Persistence

- Presets are stored in `projecttasks_data.json` with schema version 3.
- Stored fields are project ID, provider, source key, argument text, and last-used
  timestamp.
- Terminal output and environment variables are not stored with presets.
