# DevLauncher Project Structure

This document is a map for future code reading, search, and migration checks. It reflects the current repository structure after the Rust side was split into modules aligned with the React built-in feature folders.

## Top-Level Layout

```text
dev-launcher/
+-- app/                 # Main Tauri desktop app: React frontend + Rust backend
+-- website/             # Static/marketing or web preview site, separate from Tauri app
+-- README.md            # Product-level README; may lag behind implementation details
+-- project-plan.md      # Historical planning notes
+-- plan-remoteDeskP2p.md
`-- v1.md
```

Use `app/` for the actual desktop application. Use `website/` only when working on the separate website surface.

## App Layout

```text
app/
+-- src/                 # React + TypeScript UI
+-- src-tauri/           # Rust backend and Tauri configuration
+-- public/              # Frontend static assets
+-- index.html
+-- package.json
`-- vite.config.ts
```

Common commands:

```powershell
cd app
npm run build
cd src-tauri
cargo check
```

## React Frontend

```text
app/src/
+-- App.tsx              # Main keyboard launcher window and global shortcut wiring
+-- main.tsx             # Window/view entry routing for built-in feature apps
+-- api/                 # Tauri invoke wrappers and frontend API helpers
+-- components/          # Shared launcher UI components
+-- store/               # Zustand keyboard/config state
+-- types/               # Action and config TypeScript types
`-- builtins/            # Built-in feature UI modules
```

Important frontend files:

- `app/src/builtins/_registry.ts`: registers built-in feature manifests and React apps.
- `app/src/builtins/types.ts`: shared built-in manifest types.
- `app/src/types/actions.ts`: action schema used by the keyboard launcher.
- `app/src/api/config.ts`: `load_config`, `save_config`, and `get_config_path` invoke wrappers.
- `app/src/App.tsx`: maps built-in actions to `toggle_<feature>_window` commands.

## Built-In Feature Alignment

Each built-in feature should have a React folder under `app/src/builtins/<id>/` and a matching Rust module under `app/src-tauri/src/builtins/<id>.rs` when backend commands are needed.

```text
Feature        React UI folder                         Rust backend module
clipboard      app/src/builtins/clipboard/             app/src-tauri/src/builtins/clipboard.rs
json           app/src/builtins/json/                  app/src-tauri/src/builtins/json.rs
remotedesk     app/src/builtins/remotedesk/            app/src-tauri/src/builtins/remotedesk.rs
screenshot     app/src/builtins/screenshot/            app/src-tauri/src/builtins/screenshot.rs
screenshotai   app/src/builtins/screenshotai/          app/src-tauri/src/builtins/screenshotai.rs
terminal       app/src/builtins/terminal/              app/src-tauri/src/builtins/terminal.rs
totp           app/src/builtins/totp/                  app/src-tauri/src/builtins/totp.rs
```

When adding or auditing a built-in feature, check these places together:

- `app/src/builtins/<id>/manifest.ts`
- `app/src/builtins/<id>/App.tsx`
- `app/src/builtins/_registry.ts`
- `app/src-tauri/tauri.conf.json` window definitions
- `app/src-tauri/src/builtins/<id>.rs`
- `app/src-tauri/src/builtins/mod.rs`
- `app/src-tauri/src/lib.rs` invoke handler list

## Rust Backend

```text
app/src-tauri/
+-- Cargo.toml
+-- tauri.conf.json
+-- capabilities/default.json
`-- src/
    +-- main.rs           # Thin binary entry; calls app_lib::run()
    +-- lib.rs            # Tauri builder, plugins, invoke handlers, setup, tray
    +-- actions.rs        # Generic launcher actions: app/folder/file/url/ssh/script/system
    +-- config.rs         # keyboard.yaml load/save/path commands
    +-- types.rs          # Rust config/action/clipboard shared data types
    +-- builtins/         # Backend modules for built-in features
    `-- utils/            # Shared helpers such as icon extraction and image encoding
```

Current Rust module entry points:

- `app/src-tauri/src/lib.rs`: declares `mod actions`, `mod builtins`, `mod config`, `mod types`, and `mod utils`.
- `app/src-tauri/src/builtins/mod.rs`: exposes all built-in backend modules.
- `app/src-tauri/src/utils/mod.rs`: exposes shared utility modules.

## Rust Command Search Map

Search by command name when tracing a frontend `invoke(...)` call:

```powershell
rg "invoke\\(\"command_name" app/src
rg "pub fn command_name|async fn command_name" app/src-tauri/src
```

Main command groups:

- Config: `load_config`, `save_config`, `get_config_path` in `config.rs`.
- Generic actions: `execute_action`, `save_ssh_password`, `delete_ssh_password` in `actions.rs`.
- Clipboard: clipboard history, favorites, and copy/paste commands in `builtins/clipboard.rs`.
- JSON/TOTP/ScreenshotAI window toggles: their matching files in `builtins/`.
- Remote desktop: RDP profiles, host WebSocket server, FRP, and ngrok in `builtins/remotedesk.rs`.
- Terminal: PTY lifecycle and staged command execution in `builtins/terminal.rs`.
- Screenshot: capture window toggle, pending screenshot, and file writing in `builtins/screenshot.rs`.
- Icons: `extract_app_icons` in `utils/icon.rs`.

## Migration Audit Notes

The Rust migration is now wired through the module tree:

- `lib.rs` no longer contains the old monolithic command implementations.
- Split modules under `app/src-tauri/src/builtins/`, `actions.rs`, `config.rs`, `types.rs`, and `utils/` are reachable from the crate root.
- Frontend invoke names still match Rust command function names.
- Verified with `cargo check` in `app/src-tauri`.
- Verified with `npm run build` in `app`.

## Website Layout

```text
website/
+-- src/                 # Website source files
+-- public/              # Website static assets
+-- scripts/             # PowerShell dev-server helpers
+-- server.mjs
+-- package.json
`-- README.md
```

The website is separate from the Tauri app and should not be used as evidence for desktop app runtime behavior unless a task explicitly targets it.
