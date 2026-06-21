# Repository Agent Instructions

For coding, debugging, refactoring, deletion, implementation, documentation, and multi-step project work, use the `strict-plan-executor` skill before acting. Treat the user's latest instruction and explicit scope boundaries as controlling, audit partial prior work after corrections, and verify claims with repository evidence or command output.

## Encoding Rules

- Treat all source, config, and documentation text files in this repository as UTF-8.
- Do not interpret garbled PowerShell output as proof that file bytes are damaged.
- Before editing Chinese or other non-ASCII text, verify the actual bytes with a strict UTF-8 read path or `scripts/check-utf8.ps1`.
- Avoid `Get-Content -Encoding utf8` as the only evidence in this environment; use `Get-Content -LiteralPath` for quick viewing and byte-safe .NET reads for validation.
- When a file is already corrupted, prefer a clean UTF-8 rewrite of the affected text over patching mojibake in place.
- Keep diagrams and tree maps intended for terminal reading in plain ASCII unless Unicode is required.

Useful validation command:

```powershell
.\scripts\check-utf8.ps1
```

## DevLauncher Pet Status Reporting

For coding, debugging, implementation, verification, and other multi-step work in this repository, keep the DevLauncher desktop pet updated with short status summaries.

Prefer the `devlauncher_pet` MCP tools when they are available:

- `pet_set_status`
- `pet_notify`

If those tools are not visible in the current Codex thread, use the local fallback script:

```bash
node scripts/pet-status.mjs working "正在处理：简短任务名"
```

Status mapping:

- Start thinking, analysis, or planning: `thinking`
- Start editing, command work, or verification: `working`
- Waiting for user approval, permission, or clarification: `waiting`
- Before any Codex tool call that will pause for user approval, such as elevated permissions, plugin install, opening a GUI app, destructive command approval, or an explicit user choice: send `waiting` first. The pet must show "待批准/等待确认" while Codex is blocked on the user, not "执行中".
- Task completed and verified: `success`
- Command, build, or verification failed: `error`
- No active work remains: `idle`

Only send a concise summary, not full conversation text, secrets, credentials, or long command output. Keep messages short enough for the pet badge, roughly 60 characters or less.
