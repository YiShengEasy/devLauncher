# MCP Contract

## Server

Name: `devlauncher-automation-mcp`
Transport: local stdio
Default domain: local DevLauncher application data

The server reuses the repository's dependency-free JSON-RPC framing for the
first release. Tool inputs are validated again by deterministic server code.

## Tool Set

### devlauncher_get_capabilities

Read-only. Returns supported action, condition, completion, and platform
adapter values.

### devlauncher_list_workflows

Read-only. Returns summaries and current configuration revision.

### devlauncher_get_workflow

Read-only. Accepts workflow ID or exact name.

### devlauncher_preview_workflow

Read-only and non-executing. Accepts a workflow draft and returns:

- Normalized workflow.
- Validation errors.
- Warnings.
- Risk findings.
- Configuration diff summary.
- Current revision.

### devlauncher_apply_workflow

Mutating. Requires a valid normalized workflow and `expectedRevision`. Creates
or replaces by stable ID. Never executes it.

### devlauncher_delete_workflow

Destructive. Rejects deletion while bound unless `removeBindings` is true.

### devlauncher_bind_workflow

Mutating. Accepts workflow ID, page name or index, key, expected revision, and
replace flag.

### devlauncher_unbind_key

Destructive for the selected binding.

Run, cancel, and run-status tools are reserved for a later desktop bridge. The
MVP MCP never executes actions. Saved workflows run through DevLauncher itself.

## Example Preview Input

```json
{
  "workflow": {
    "name": "Start frontend development",
    "description": "Open the project and wait for the local server.",
    "failurePolicy": "stop",
    "steps": [
      {
        "name": "Start dev server",
        "action": {
          "type": "script",
          "name": "Start dev server",
          "shell": "terminal",
          "content": "npm run dev"
        },
        "condition": {"type": "always"},
        "completion": {
          "type": "port_ready",
          "host": "127.0.0.1",
          "port": 5173,
          "intervalMs": 500,
          "timeoutMs": 30000
        }
      }
    ]
  }
}
```

## Structured Result

Every successful tool result includes:

```json
{
  "ok": true,
  "revision": 9,
  "data": {},
  "warnings": []
}
```

Errors include a stable code:

```text
VALIDATION_FAILED
REVISION_CONFLICT
NOT_FOUND
ALREADY_RUNNING
UNSUPPORTED_COMPLETION
EXECUTION_DENIED
CONFIG_IO_ERROR
```

## Annotations

- Read tools: `readOnlyHint: true`, `openWorldHint: false`.
- Preview: `readOnlyHint: true`, `openWorldHint` derived conservatively.
- Apply/bind: `destructiveHint: false`, `idempotentHint: true`.
- Delete/unbind: `destructiveHint: true`.

Annotations improve host UX but are not security enforcement.

## App Communication

The MCP server never hand-edits YAML. It calls the shared Rust
`devlauncherctl`, which uses the same serde model, validator, atomic writer, and
revision field as the desktop application.
