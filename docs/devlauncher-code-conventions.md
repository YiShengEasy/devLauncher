# DevLauncher Code Conventions

Last updated: 2026-07-18

These conventions keep DevLauncher extensions consistent with the current app style and execution model. Update this file with every architectural or workflow convention that future feature work should preserve.

## General

- Keep changes scoped to the relevant builtin, plugin, workflow helper, or Tauri command.
- Prefer existing action and workflow primitives before introducing a new persistence model.
- Keep user-facing tools compact and operational. Avoid marketing-style pages inside the app.
- Preserve UTF-8 for source, config, docs, and Chinese UI text.
- Do not commit local caches, generated dependency directories, or temporary build artifacts.

## Frontend

- Use existing inline style constants in the component when a file already uses them.
- Match the current DevLauncher dark, compact, small-radius style.
- Keep controls stable in height and width; status, errors, and loading states should not shift the layout dramatically.
- Use short command labels such as `运行`, `保存`, `导入`, `导出`, `复制`.
- Keep dense operational UIs scan-friendly: left navigation, center editor, right properties/status panel is preferred for complex tools.
- Add tests for pure model helpers and data migrations.

## Actions

- Add new standalone capabilities as one of the existing `Action` variants when possible.
- `script` actions are the preferred bridge for CLI tools such as Playwright, k6, Trivy, kubectl, docker, and task.
- `plugin` actions should open a WebView plugin and not assume native filesystem, process, or network bypass capability.
- `builtin` actions are for trusted DevLauncher-owned windows with Tauri commands.

## Workflows

- Workflow templates must emit regular `WorkflowDefinition` objects.
- Template steps should use plain shell commands and conservative timeouts.
- Prefer `process_exit` for checks and `port_ready` for service readiness.
- Add `path_exists` or `platform` conditions when a template is expected to degrade safely.
- Avoid nested workflow actions; the Rust validator rejects them.

## Plugins

- Current plugin kind is `webview` only.
- Plugin IDs use lowercase letters, digits, dots, and dashes.
- Plugin entries must be relative `.html` files.
- Plugin UI should work offline unless its function is inherently network-based.
- Marketplace zip, checksum, README, and index must be updated together.

## Native Commands

- Register new Tauri commands in `app/src-tauri/src/lib.rs`.
- Keep command errors stable and human-readable.
- Do not store plaintext secrets in app config. Use OS credential storage or temporary runtime state.
- Long-running processes must have explicit stop/status commands and cleanup paths.

## Verification

For app changes, prefer:

```bash
npm --prefix app test
npm --prefix app run build
cargo test --manifest-path app/src-tauri/Cargo.toml
cargo check --manifest-path app/src-tauri/Cargo.toml
git diff --check
```

For plugin changes:

```bash
node examples/plugins/<plugin>/smoke-test.mjs
```

If marketplace archives change, verify the zip hash and update `marketplace/marketplace.json`.

