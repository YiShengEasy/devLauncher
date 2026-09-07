# Plugin and MCP Contract

## Plugin Manifest v2

Plugins may add `capabilities` beside existing WebView `actions`:

```json
{
  "id": "example.tools",
  "actions": [{"id": "open", "title": "Open", "type": "webview"}],
  "capabilities": [{
    "id": "example.tools.format",
    "version": 1,
    "title": "Format text",
    "executionMode": "sync",
    "inputs": [{"id": "text", "type": "string", "required": true}],
    "outputs": [{"id": "text", "type": "string"}]
  }]
}
```

Plugin capability execution requires a separate native/host bridge. Declaring
a descriptor alone never grants command, file, or network access.

## MCP Additions

### `devlauncher_list_capabilities`

Returns descriptor summaries and platform availability.

### `devlauncher_get_capability`

Returns the complete input/output schema for one stable ID.

### Workflow Preview

Preview additionally validates:

- Capability existence and platform.
- Required inputs and field types.
- Output reference source and field name.
- Permission declarations.

## Generation Sequence

Codex should:

1. List capabilities.
2. Read schemas for selected capabilities.
3. Build a draft using stable IDs.
4. Preview and repair validation errors.
5. Apply with expected revision.
6. Bind only after apply succeeds.
