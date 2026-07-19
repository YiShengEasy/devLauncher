# Security

## Threat Model

The feature accepts model-generated configuration that may launch processes,
execute scripts, connect to hosts, open URLs, or invoke plugins. Treat every
MCP argument as untrusted input.

## Mandatory Controls

### Draft Before Apply

- Preview never mutates configuration.
- Apply never executes.
- Run only accepts a saved workflow ID.

### Secrets

- Reject password, token, private key body, cookie, and authorization fields.
- Permit only credential references.
- Continue storing SSH and website credentials in the OS credential store.
- Redact secret-like environment values and command output.

### Script Safety

- Enforce script size limits.
- Keep shell type explicit.
- Return risk findings for destructive commands, privilege escalation,
  downloads piped to shell, credential access, and broad file deletion.
- High-risk findings require explicit host approval.
- MCP cannot lower the local approval policy.

### Paths and Environment

- Normalize paths without expanding arbitrary command substitutions.
- Environment conditions may read only named variables.
- Workflow environment overrides use an allowlist.
- Do not expose the full host environment through MCP results.

### Network

- Loopback port checks are closed-domain.
- Non-loopback URL, SSH, and port operations are open-world.
- Remote MCP transport is not enabled in the MVP.

### Configuration Integrity

- Strict schema validation.
- Unknown fields rejected by MCP.
- Atomic save.
- Revision conflict protection.
- Back up the previous config before schema migration.

### Execution Limits

- Maximum workflow steps.
- Timeout bounds.
- Output size limits.
- Cancellation token.
- No recursive workflow invocation.
- No automatic retry loop without a finite count.

## Approval Matrix

| Operation | Default |
| --- | --- |
| List/get | No additional confirmation |
| Preview | No additional confirmation |
| Apply additive workflow | Host approval according to MCP policy |
| Replace binding | Explicit confirmation when occupied |
| Delete workflow/binding | Explicit confirmation |
| Run app/folder/local URL | Normal tool approval |
| Run script/SSH/system command | Explicit important-action approval |
| Save credentials | Not exposed through automation MCP |

## Audit

Record local audit entries for:

- MCP tool name.
- Timestamp.
- Workflow and run IDs.
- Change summary.
- Risk categories.
- Result code.

Do not record full script output or credentials in the audit log.
