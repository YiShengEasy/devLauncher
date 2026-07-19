# DevLauncher Automation Codex Plugin

This local Codex plugin exposes MCP tools for creating and binding DevLauncher
workflows without editing YAML.

## Requirements

- DevLauncher repository checkout or a packaged `devlauncherctl` binary.
- Node.js and Rust/Cargo available on PATH for repository development.
- Start a new Codex task after plugin installation.

## Safety

- Preview is read-only.
- Apply uses configuration revision checks and never executes a workflow.
- Secret-like fields are rejected.
- Delete and unbind tools are marked destructive.
- The Rust helper validates and atomically writes the same `keyboard.yaml`
  consumed by DevLauncher.

Set `DEVLAUNCHER_CONFIG_PATH` to test against an isolated configuration.
Set `DEVLAUNCHER_CTL` to a packaged `devlauncherctl` executable.
