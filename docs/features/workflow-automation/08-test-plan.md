# Test Plan

## TypeScript Unit Tests

- Legacy raw config normalizes to empty workflows.
- Workflow config round-trips without losing actions or bindings.
- Workflow action executes through `run_workflow`.
- Validation rejects duplicate IDs, empty names, invalid ports, excessive
  timeout, recursive workflow actions, and secret fields.
- UI helper defaults match each action type.

## Rust Unit Tests

- Legacy YAML deserializes with defaults.
- Workflow YAML round-trips.
- Atomic writer preserves the previous file on serialization failure.
- Revision conflict does not write.
- Conditions return expected decisions.
- Port-ready succeeds and times out.
- Timer is cancellable.
- Process-exit accepts configured codes and reports stderr safely.
- Cancellation produces terminal states.
- Enabled schedule intervals and daily `HH:MM` values validate inside the
  supported bounds.
- Standalone step plans ignore previous-step conditions and sequencing delay.

## MCP Contract Tests

- `initialize` and `tools/list` return valid protocol responses.
- Read tools do not mutate files.
- Preview returns normalized structured data.
- Apply requires valid revision.
- Unknown fields and inline credentials are rejected.
- Bind refuses occupied keys unless replacement is explicit.
- Run accepts saved IDs only.
- Tool annotations match documented risk.

## UI Integration Tests

- Create and save workflow.
- Add and edit a step.
- Reorder with buttons.
- Select a completion rule and see contextual fields.
- Bind to an empty key.
- Replace an occupied key through confirmation.
- Run and cancel.
- Run one step and inspect its status/output independently.
- Enable interval and daily schedules, verify the “自启动” list marker, observe
  a scheduled trigger, and stop the run.
- Existing non-workflow bindings still execute.

## Manual Cross-Platform Checks

### macOS

- App and folder launch.
- Terminal script process-started and process-exit behavior.
- Port-ready on loopback.
- Global shortcut invokes workflow.
- Permission guidance remains feature-triggered.

### Windows

- App/folder/script action compatibility.
- PowerShell and CMD process-exit.
- SSH terminal preference.
- Global shortcut invokes workflow.

## Security Regression

- No password fields in workflow schema.
- MCP preview never runs scripts.
- MCP apply never runs scripts.
- Logs redact common secret formats.
- Deleting a bound workflow requires explicit behavior.
- Malformed YAML does not overwrite the last valid backup.

## Visual QA

- 900px main window has no overlapping controls.
- Long workflow and step names truncate predictably.
- Inspector scrolls independently.
- Select menus remain dark and readable on macOS.
- Run states remain visible without resizing step rows.
