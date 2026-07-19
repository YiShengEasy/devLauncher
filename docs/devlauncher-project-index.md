# DevLauncher Project Index

Last updated: 2026-07-18

This index is the working map for future DevLauncher feature work. Update it whenever a new builtin, plugin, workflow capability, marketplace package, or major UI entry point is added.

## Product Shape

DevLauncher is a Tauri desktop launcher centered on a virtual keyboard. A key can run a single action, open a builtin tool, open a WebView plugin, or start a multi-step workflow.

Core surfaces:

- Virtual keyboard: `app/src/components/KeyboardPanel.tsx`, `app/src/components/KeyCell.tsx`.
- Action binding: `app/src/components/BindingModal.tsx`.
- Main launcher shell: `app/src/App.tsx`.
- Workflow manager: `app/src/components/WorkflowPanel.tsx`.
- Plugin center: `app/src/components/PluginCenter.tsx`.
- Builtin tool windows: `app/src/builtins/*`.
- Tauri commands and native execution: `app/src-tauri/src/*`.

## Action Model

Frontend action types live in `app/src/types/actions.ts`.

Supported action categories:

- `app`: launch a desktop app.
- `folder`: open a folder with Explorer/Finder/VS Code/Cursor/custom opener.
- `file`: open a file.
- `url`: open a URL, optionally with account autofill metadata.
- `ssh`: launch an SSH session.
- `script`: run a shell command or script file.
- `system`: run a safe preset system command.
- `builtin`: open a DevLauncher builtin.
- `plugin`: open a WebView plugin action.
- `workflow`: run a saved workflow.

Rust action dispatch:

- Workflow dispatch entry: `app/src-tauri/src/workflow.rs`.
- Generic action execution: `app/src-tauri/src/actions.rs`.
- Platform launch helpers: `app/src-tauri/src/platform.rs`.
- CLI helper: `app/src-tauri/src/bin/devlauncherctl.rs`.

## Builtins

Frontend builtin manifests are imported in `app/src/types/actions.ts`.

Current builtin modules:

- Clipboard: `app/src/builtins/clipboard`.
- JSON helper: `app/src/builtins/json`.
- TOTP: `app/src/builtins/totp`.
- Remote desktop: `app/src/builtins/remotedesk`.
- Terminal: `app/src/builtins/terminal`.
- Screenshot AI: `app/src/builtins/screenshotai`.
- Screenshot: `app/src/builtins/screenshot`.
- Web accounts: `app/src/builtins/webaccounts`.
- Quick Memory: `app/src/builtins/quickmemory`.

Native builtin commands are registered through `app/src-tauri/src/lib.rs` and grouped under `app/src-tauri/src/builtins`.

## Plugins

Runtime plugin type:

- Only static WebView plugins are currently supported.
- Plugin manifest schema: `app/src/plugins/types.ts` and `app/src-tauri/src/plugin_manifest.rs`.
- Plugin manager: `app/src-tauri/src/plugin_manager.rs`.
- Marketplace index: `marketplace/marketplace.json`.
- Local examples: `examples/plugins/*`.
- Marketplace docs: `marketplace/plugins/*`.
- Release archives: `marketplace/releases/*.zip`.

Plugin package shape:

```text
plugin.json
icon.svg
README.md
dist/index.html
```

When a marketplace plugin changes:

1. Update the example plugin files.
2. Rebuild the matching `marketplace/releases/*.zip`.
3. Update `sha256` in `marketplace/marketplace.json`.
4. Update `marketplace/plugins/<id>/README.md` if behavior changed.
5. Run the plugin smoke test when present.

## Workflows

Workflow types are in `app/src/types/actions.ts`.

Frontend helpers:

- `app/src/api/workflow.ts`.
- `app/src/api/workflow.test.ts`.

UI:

- `app/src/components/WorkflowPanel.tsx`.

Native engine:

- `app/src-tauri/src/workflow.rs`.

Current workflow model supports:

- Ordered steps.
- Conditions: always, previous success, previous failed, platform, path exists, env equals.
- Completion rules: action resolved, process started, process exit, port ready, timer, manual, window ready, URL ready, connection ready.
- Failure policy: stop or continue.

Workflow templates should be added in frontend helper modules first. They should produce normal `WorkflowDefinition` objects.

Template package support:

- Builtin template package model: `app/src/api/workflowTemplates.ts`.
- Marketplace package field: `workflowTemplatePackages` in `marketplace/marketplace.json`.
- Install/import entry: `app/src/components/PluginCenter.tsx`.
- Monitor dashboard entry: `app/src/components/WorkflowPanel.tsx`.

## DevOps, Test, And Developer Automation Direction

Preferred integration pattern:

1. Wrap external CLIs as `script` workflow steps.
2. Add compact UI affordances only after the command model is stable.
3. Promote to builtin only when native permissions, secure storage, or long-running status are required.
4. Use WebView plugins for standalone tools that can work with browser storage and no native filesystem access.

Current priority tracks:

- API Lab: lightweight API requests plus collection runner.
- Workflow templates: project start, test/build/check, release preflight, local monitor.
- Workflow template packages: market-discoverable packages imported into local workflows.
- Monitor dashboard: lightweight status and run controls for monitoring workflows.
- Ops dashboard: local health checks and command shortcuts before heavy Prometheus/Grafana integration.
