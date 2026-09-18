# Test Plan

## Unit Tests

- Descriptor registry rejects duplicate IDs.
- Platform filtering is deterministic.
- Required, optional, unknown, and mistyped inputs are validated.
- Whole-value and embedded references resolve correctly.
- Missing step or output references fail with stable codes.
- Text replacement reports output and replacement count.
- Clipboard adapter errors are converted to capability errors.
- Output size limits and redaction are enforced.
- Existing action-only YAML round-trips unchanged.

## Integration Tests

- Capability descriptors returned by Tauri match frontend parsing.
- A four-step text pipeline passes output between every step.
- Cancellation interrupts a waiting capability.
- Run history reloads bounded outputs.
- MCP preview accepts the same definition as desktop validation.

## Regression Tests

- Existing script process exit and project task workflows.
- Existing workflow schedules.
- Keyboard workflow bindings.
- Built-in and plugin window actions.
- Single-step execution and run history.

## Manual Validation

1. Copy sample text.
2. Run the built-in clipboard transformation workflow.
3. Confirm transformed text is placed on the clipboard.
4. Inspect run details for outputs without duplicate windows.
5. Restart DevLauncher and confirm the workflow still loads.

## Commands

```bash
cd app
npm test
npm run build

cd src-tauri
cargo test
cargo check

node scripts/test-automation-mcp.mjs
```
