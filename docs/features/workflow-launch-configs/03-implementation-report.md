# Implementation Report

## Result

Workflow config files are now first-class workflow inputs. The editor manages a compact file list and saved default. Manual runs may override the default while non-interactive triggers remain deterministic.

## Runtime Contract

- `run_workflow` and `run_workflow_step` accept an optional `configId`.
- Missing selections fall back to `defaultConfigId`.
- A missing selected file stops the run before any step starts.
- Script replacements use shell-specific quoting.
- Capability inputs resolve the same config references as step-output references.

## Verification

- Frontend: 31 test files and 142 tests passed.
- Frontend production build passed.
- Rust: all-target check passed; 109 tests passed.
- Changed source and documentation files passed strict UTF-8 reads.
- Browser-only preview is not a valid visual harness for this Tauri window because it requires Tauri window metadata; runtime UI remains covered by the production TypeScript build.
