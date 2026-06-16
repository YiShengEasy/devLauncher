# DevLauncher

Developer productivity launcher for Windows and macOS MVP workflows. DevLauncher binds frequent development actions to a virtual keyboard and ships several built-in utility panels for everyday engineering work.

![version](https://img.shields.io/badge/version-0.2.0-blue)
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20MVP-lightgrey)
![tauri](https://img.shields.io/badge/Tauri-2.x-orange)

## Current Status

The main desktop app lives in `app/`. The standalone website lives in `website/` and is intentionally separate from the Tauri application.

Recent app work focused on built-in tools and plugin-style feature registration:

- Rust backend commands were split into modules under `app/src-tauri/src/`.
- Built-in windows are routed through `?view=<id>` and registered in `app/src/builtins/_registry.ts`.
- The app now includes a `quickmemory` built-in panel for beginner-friendly command and shortcut recall.
- Verification baseline: `npm run build` in `app/` and `cargo check` in `app/src-tauri/`.

## Features

| Feature | Description |
| --- | --- |
| Virtual keyboard launcher | Bind actions to keyboard-like keys and trigger them from the main panel. |
| Multiple pages | Organize bindings across pages and switch pages with `Tab` / `Shift+Tab`. |
| Global shortcuts | Platform-aware shortcuts toggle the main window and trigger active page bindings. |
| Tray behavior | Main window can hide to tray and be shown again from the tray/menu. |
| Action bindings | Supports app, folder, file, URL, SSH, script, system command, and built-in actions. |
| Theme settings | Glass-style panel with configurable background, blur, border, and key opacity. |
| Folder open-with | Folder bindings can open in Explorer/Finder, VS Code, Cursor, or a custom opener. |
| Built-in panels | Clipboard, JSON, TOTP, remote desk, terminal, screenshot, screenshot report, web accounts, and quick memory. |

## Built-In Panels

| ID | Panel | Notes |
| --- | --- | --- |
| `clipboard` | Clipboard history | Recent clipboard history, favorites, and quick restore. |
| `json` | JSON helper | JSON formatting and developer utility window. |
| `totp` | TOTP | Local token management panel. |
| `remotedesk` | Remote desk | RDP profiles and remote host/tunnel helpers. |
| `terminal` | Terminal | Built-in PTY terminal window and staged command execution. |
| `screenshot` | Screenshot | Capture, annotate, and save screenshots. |
| `screenshotai` | Screenshot report | Issue-report workflow for screenshots and AI/collaboration prompts. |
| `webaccounts` | Web accounts | Chrome extension and web account binding support. |
| `quickmemory` | Quick memory | Beginner-friendly command/shortcut memory panel with search, copy counts, and drag-to-swap ordering. |

## Quick Memory

The Quick Memory panel is designed for developers who are still building command-line and editor muscle memory.

Current categories:

- Linux / Shell
- Git
- VS Code
- Docker
- Node / Package

Behavior:

- Click any card to copy its command or shortcut.
- Copy counts are stored locally and shown on each card.
- Drag one card onto another card to swap their order.
- Ordering is stored per category in `localStorage`.
- Search filters by title, command, shortcut, description, kind, and tags.

## Shortcuts

| Shortcut | Behavior |
| --- | --- |
| `Ctrl+Alt+Space` | Show or hide the main DevLauncher window on Windows. |
| `Alt+<key>` | Trigger the binding for a key on the active page on Windows. |
| `Ctrl+Alt+V` | Open clipboard history on Windows. |
| `Tab` / `Shift+Tab` | Switch launcher pages while the main window is focused. |
| `Esc` | Hide most built-in utility windows. |

### macOS Shortcut Behavior

DevLauncher must be running before global shortcuts work. The virtual keyboard window can be hidden after startup; registered key bindings still work while the app process is running in the background.

Default macOS shortcuts:

| Shortcut | Behavior |
| --- | --- |
| `Cmd+Opt+Space` | Show or hide the main DevLauncher window. |
| `Cmd+Opt+<key>` | Trigger the binding for a key on the active page. |
| `Cmd+Opt+V` | Open clipboard history. |
| `Cmd+Opt+K` | Open search. |
| `Cmd+Opt+P` | Open pet/entry mode. |

## Project Layout

```text
dev-launcher/
+-- app/                  # Main Tauri desktop app
|   +-- src/              # React + TypeScript frontend
|   |   +-- App.tsx       # Main launcher window
|   |   +-- main.tsx      # Routes built-in windows by ?view=<id>
|   |   +-- builtins/     # Built-in panel UIs and manifests
|   |   +-- components/   # Shared UI components
|   |   +-- store/        # Zustand state
|   |   `-- types/        # Action and config types
|   `-- src-tauri/        # Rust backend, Tauri config, capabilities
+-- website/              # Separate static website project
+-- PROJECT_STRUCTURE.md  # Codebase map and migration notes
`-- README.md
```

## Built-In Registration Chain

When adding or auditing a built-in panel, check these files together:

```text
app/src/builtins/<id>/manifest.ts
app/src/builtins/<id>/App.tsx
app/src/builtins/_registry.ts
app/src/types/actions.ts
app/src/components/BuiltinIcon.tsx
app/src-tauri/tauri.conf.json
app/src-tauri/capabilities/default.json
app/src-tauri/src/builtins/<id>.rs
app/src-tauri/src/builtins/mod.rs
app/src-tauri/src/lib.rs
```

## Development

Requirements:

- Windows with WebView2, or macOS with system WebView support
- Node.js 18+
- Rust stable with Cargo available on PATH

Install and run:

```powershell
cd app
npm install
npm run tauri dev
```

Build frontend:

```powershell
cd app
npm run build
```

Check Rust backend:

```powershell
cd app/src-tauri
cargo check
```

Create desktop bundle:

```powershell
cd app
npm run tauri build
```

## Configuration

The keyboard configuration is saved under the app data directory for the Tauri identifier `com.yisheng.app`.

Example binding:

```yaml
pages:
  - name: Dev
    keys:
      Q:
        action:
          type: builtin
          name: Quick Memory
          feature: quickmemory
```

## Website

The `website/` project is separate from the desktop app. Use it for the product website and public presentation work, not as evidence for desktop runtime behavior.

Common website scripts are defined in `website/package.json`.

## License

MIT
