# Project Task Arguments Implementation Report

## Delivered

- Added a task argument editor below the command preview.
- Preserved the original discovered command in preview and appended only the
  entered argument text.
- Kept backend runner and working-directory wrappers out of the preview.
- Added task-scoped argument preset save, select, clear, and delete controls.
- Added automatic recent-history promotion after successful task dispatch.
- Added quoted argument parsing with malformed-input feedback.
- Added schema version 3 persistence in `projecttasks_data.json`.
- Added package-script argument forwarding after `--`.
- Added Markdown task argument execution after backend source revalidation.
- Markdown tasks now execute their declared command directly without a
  `runme run` wrapper.
- Preserved argument-free project-task workflow behavior.

## Safety

- The frontend rejects shell control operators in the argument editor.
- The backend rejects null bytes, newlines, excessive counts, and oversized
  argument values.
- The backend shell-quotes each parsed argument independently.
- The Markdown execution test runs the generated command and verifies that a
  spaced value arrives as one argument.

## Verification

- Frontend: 31 files and 141 tests passed.
- Rust: 103 tests passed.
- Frontend production build passed.
- `cargo check --all-targets` passed.
- `cargo fmt --all -- --check` passed.
