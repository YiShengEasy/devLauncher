# Window Pin Layering Design

## Goal

Make every DevLauncher popup window behave predictably on macOS by giving each
window its own remembered pin state.

When a window is pinned, it stays above other apps. When it is unpinned, other
apps can move in front of it naturally. Each popup remembers its own state
across restarts.

## Selected Approach

Use option 2: a Rust-owned window layer service plus a shared frontend pin
control.

Rust is the source of truth for:

- which windows support pinning
- each window's default pin state
- persisted user choices
- applying platform-specific layer behavior

The frontend only displays the current state and sends toggle requests.

## Scope

Pin controls apply to normal DevLauncher entry and tool windows:

- `main`
- `pet`
- `search`
- `clipboard`
- `json-helper`
- `totp`
- `remotedesk`
- `terminal`
- `screenshotai`
- `webaccounts`
- `quickmemory`

The screenshot capture overlay window remains special. It should not expose a
normal user pin toggle because it must stay above the desktop while selecting a
capture region.

## Default Policy

The chosen default policy is option 3.

Entry windows are pinned by default:

- `main`
- `pet`
- `search`

Tool windows are unpinned by default:

- `clipboard`
- `json-helper`
- `totp`
- `remotedesk`
- `terminal`
- `screenshotai`
- `webaccounts`
- `quickmemory`

Special capture overlay:

- `screenshot` stays forced on top during capture.

## User Experience

Each supported popup gets a small pin button in its existing window chrome or
top toolbar.

Pinned state:

- icon shows active state
- tooltip text: `取消置顶`
- window stays above other apps

Unpinned state:

- icon shows inactive state
- tooltip text: `置顶`
- clicking another app can bring that app in front

The control should be compact and consistent with existing macOS-style window
controls. Prefer an icon button over visible explanatory text.

## Data Model

Persist user choices in a small JSON file under Tauri's app data directory, for
example:

```json
{
  "main": true,
  "clipboard": false,
  "quickmemory": true
}
```

Missing keys fall back to the default policy. A missing file means first run.
A corrupted file should be ignored and rewritten with valid state after the
next successful change.

## Rust Commands

Add a small window-layer module behind Tauri commands.

Proposed commands:

- `get_window_pin_state(label: String) -> WindowPinState`
- `set_window_pin_state(label: String, pinned: bool) -> WindowPinState`
- `list_window_pin_states() -> Vec<WindowPinState>`

`WindowPinState`:

```rust
struct WindowPinState {
    label: String,
    pinned: bool,
    default_pinned: bool,
    supported: bool,
}
```

Unknown or unsupported labels should return a clear error rather than silently
changing unrelated windows.

## Layer Application

Whenever a supported window is shown, toggled, restored, or changed through the
pin button, Rust should apply the stored pin state before or during display.

Pinned:

- call `set_always_on_top(true)`
- on macOS, apply the existing AppKit layer behavior where needed so entry
  windows remain available across spaces and full-screen contexts

Unpinned:

- call `set_always_on_top(false)`
- avoid forcing the window above other apps after the user switches apps

Existing screenshot capture behavior should stay separate. The screenshot
overlay still uses its own full-screen/on-top handling.

## Frontend Integration

Add a shared pin control, for example:

- `WindowPinButton`
- `useWindowPinState`

The hook should:

- read the current window label
- call `get_window_pin_state` on mount
- call `set_window_pin_state` on toggle
- subscribe to a `window-pin-changed` event so duplicated UI stays in sync

Use the shared control in popup chrome/top bars rather than implementing
separate logic inside each builtin app.

## Event Flow

Window opens:

1. Rust resolves default plus persisted state.
2. Rust applies the layer state.
3. Frontend reads and renders the pin state.

User toggles pin:

1. Frontend invokes `set_window_pin_state`.
2. Rust validates the label.
3. Rust applies the layer change.
4. Rust persists the new state.
5. Rust emits `window-pin-changed`.
6. Frontend updates the icon state.

## Migration

Existing `alwaysOnTop` values in `tauri.conf.json` should become startup
fallbacks only. Runtime behavior should be controlled by the Rust pin service.

On first run after this change, no persisted pin file exists, so the default
policy above applies.

## Verification

Automated checks:

- Rust tests for supported-window classification and defaults
- Rust tests for loading missing and corrupted state files
- Rust tests for set/get persistence behavior
- frontend tests for the shared hook or button where the current test setup
  makes that practical

Manual macOS QA:

- `main`, `pet`, and `search` start pinned by default
- `clipboard` starts unpinned by default
- pinned `clipboard` stays above Codex, Chrome, and Finder
- unpinned `clipboard` can be covered by Codex, Chrome, and Finder
- each popup remembers its own state after app restart
- changing `clipboard` does not change `quickmemory`
- screenshot capture behavior is unchanged

## Risks

macOS window layering has several overlapping concepts: focus, always-on-top,
spaces, and full-screen auxiliary behavior. The implementation should keep the
pin feature focused on layer state and avoid coupling it to unrelated focus
changes.

Some existing builtins currently call `show` and `set_focus` directly. These
paths need to be routed through the Rust layer service or explicitly apply the
pin state before showing the window.
