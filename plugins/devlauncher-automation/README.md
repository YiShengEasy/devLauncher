# DevLauncher Automation Codex Plugin

This local Codex plugin exposes MCP tools for creating and binding DevLauncher
workflows without editing YAML. It also provides read-only project discovery,
project-task reference preview, and sanitized run-history tools.

## Requirements

- DevLauncher repository checkout or a packaged `devlauncherctl` binary.
- Node.js and Rust/Cargo available on PATH for repository development.
- Start a new Codex task after plugin installation.

## Safety

- Preview is read-only.
- Project tools never return absolute project paths, full commands, terminal
  output, or configuration contents.
- Project execution, cancellation, Shell, SSH, RDP, and project file writes are
  intentionally not exposed through MCP.
- Apply uses configuration revision checks and never executes a workflow.
- Secret-like fields are rejected.
- Delete and unbind tools are marked destructive.
- The Rust helper validates and atomically writes the same `keyboard.yaml`
  consumed by DevLauncher.
- Read-only project calls append a sanitized local audit record containing the
  tool name, project ID when available, time, risk class, and result code.

Set `DEVLAUNCHER_CONFIG_PATH` to test against an isolated configuration.
Set `DEVLAUNCHER_CTL` to a packaged `devlauncherctl` executable.
