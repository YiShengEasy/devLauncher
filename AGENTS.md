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
