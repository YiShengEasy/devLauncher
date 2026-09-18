# Security

## Trust Boundary

The desktop Rust registry is authoritative. Frontend and MCP descriptor data
cannot grant new execution capability.

## Inputs

- Reject unknown fields unless a capability explicitly permits them.
- Enforce field type, required state, size, and numeric bounds.
- Resolve references only from the current run context.
- Never evaluate JavaScript, shell, or template expressions.

## Outputs

- Bound each string, object, artifact list, step result, and run history record.
- Redact fields marked secret before emitting events or persisting history.
- Reject output paths outside an adapter's declared ownership when applicable.

## Permissions

- Clipboard read and write are declared separately.
- File and network capabilities require explicit scoped descriptors.
- Interactive capabilities must identify the requesting workflow and step.
- Sensitive capability execution may require a per-run confirmation.

## MCP

- Preview remains read-only and non-executing.
- Apply cannot include inline password, token, private key, or secret output.
- Capability IDs are allowlisted by the desktop registry.
- Revision conflicts fail without partial writes.

## Logging

- Do not log clipboard contents by default.
- Persist only redacted output summaries.
- Diagnostic errors may include field names but not protected values.
