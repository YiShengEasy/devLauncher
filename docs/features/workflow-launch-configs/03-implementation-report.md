# Implementation Report

## Result

Workflow config files are now first-class workflow inputs. The editor manages a compact file list and saved default. All UI-triggered runs use that default directly without a runtime prompt.

The add flow now starts with a directory picker. DevLauncher recursively scans supported configuration formats and presents a searchable, extension-filtered list using relative paths. Only the chosen file is added to the workflow.

## Runtime Contract

- `run_workflow` and `run_workflow_step` accept an optional `configId`.
- The workflow UI omits that override so whole-workflow and single-step runs use the saved default.
- Missing selections fall back to `defaultConfigId`.
- A missing selected file stops the run before any step starts.
- Script replacements use shell-specific quoting.
- Capability inputs resolve the same config references as step-output references.
- Directory discovery reads names and paths only, skips common dependency/build directories, does not follow symlinks, and stops at 512 candidates or 32 levels.

## Verification

- Frontend: 31 test files and 142 tests passed.
- Frontend production build passed.
- Rust: all-target check passed; 110 tests passed.
- Changed source and documentation files passed strict UTF-8 reads.
- Browser-only preview is not a valid visual harness for this Tauri window because it requires Tauri window metadata; runtime UI remains covered by the production TypeScript build.
