# Window Pin Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-window pin controls so supported DevLauncher windows can remember whether they stay above other apps.

**Architecture:** Add a Rust-owned window pin service that validates supported labels, persists per-window state, applies Tauri window layering, and emits `window-pin-changed`. Add a small shared React hook/button that reads the current Tauri window label, toggles the Rust state, and plugs into existing chrome such as `MacWindowControls`.

**Tech Stack:** Tauri v2 Rust commands, serde JSON, React, TypeScript, Vitest, existing DevLauncher icon and window-control components.

---

## File Structure

- Create `app/src-tauri/src/window_pinning.rs`: Rust source of truth for supported windows, default policy, JSON persistence, Tauri commands, and layer application helpers.
- Modify `app/src-tauri/src/lib.rs`: register the new module and commands, initialize startup pin state after app setup.
- Modify `app/src-tauri/src/entries.rs`: apply pin state before showing `main`, `pet`, and `search`.
- Modify builtin Rust show/toggle files: apply pin state before showing tool windows.
- Create `app/src/windowPinning.ts`: shared frontend API types and invoke helpers.
- Create `app/src/components/WindowPinButton.tsx`: compact icon button for pinning.
- Modify `app/src/components/MacWindowControls.tsx`: optional pin button next to close/minimize controls.
- Modify app windows that use custom chrome: add the pin button to `App.tsx`, `PetEntryApp.tsx`, `quickmemory/App.tsx`, and existing `MacWindowControls` call sites.
- Modify `app/src-tauri/tauri.conf.json`: keep startup `alwaysOnTop` only for entry windows and screenshot capture; tool windows default to runtime pin service.

---

### Task 1: Add Rust Pin State Model And Persistence

**Files:**
- Create: `app/src-tauri/src/window_pinning.rs`

- [ ] **Step 1: Create a failing Rust test module for defaults and persistence**

Add this file with the tests and minimal type/function declarations in the same module. The declarations intentionally return incomplete values first so the tests fail.

```rust
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const WINDOW_PIN_CHANGED_EVENT: &str = "window-pin-changed";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPinState {
    pub label: String,
    pub pinned: bool,
    pub default_pinned: bool,
    pub supported: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, Default, PartialEq, Eq)]
struct PersistedPinStates {
    windows: BTreeMap<String, bool>,
}

const SUPPORTED_WINDOWS: &[&str] = &[
    "main",
    "pet",
    "search",
    "clipboard",
    "json-helper",
    "totp",
    "remotedesk",
    "terminal",
    "screenshotai",
    "webaccounts",
    "quickmemory",
];

const DEFAULT_PINNED_WINDOWS: &[&str] = &["main", "pet", "search"];

pub fn is_supported_window(label: &str) -> bool {
    SUPPORTED_WINDOWS.contains(&label)
}

pub fn default_pinned(label: &str) -> bool {
    DEFAULT_PINNED_WINDOWS.contains(&label)
}

fn read_state_file(path: &Path) -> PersistedPinStates {
    let Ok(content) = fs::read_to_string(path) else {
        return PersistedPinStates::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_state_file(path: &Path, state: &PersistedPinStates) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, format!("{content}\n")).map_err(|e| e.to_string())
}

fn resolve_state_from_file(path: &Path, label: &str) -> Result<WindowPinState, String> {
    if !is_supported_window(label) {
        return Err(format!("window does not support pinning: {label}"));
    }
    let persisted = read_state_file(path);
    let default_pinned = default_pinned(label);
    Ok(WindowPinState {
        label: label.to_string(),
        pinned: persisted.windows.get(label).copied().unwrap_or(default_pinned),
        default_pinned,
        supported: true,
    })
}

fn set_state_in_file(path: &Path, label: &str, pinned: bool) -> Result<WindowPinState, String> {
    if !is_supported_window(label) {
        return Err(format!("window does not support pinning: {label}"));
    }
    let mut persisted = read_state_file(path);
    persisted.windows.insert(label.to_string(), pinned);
    write_state_file(path, &persisted)?;
    resolve_state_from_file(path, label)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_file(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("devlauncher-{name}-{nanos}.json"))
    }

    #[test]
    fn classifies_supported_windows_and_defaults() {
        assert!(is_supported_window("main"));
        assert!(is_supported_window("quickmemory"));
        assert!(!is_supported_window("screenshot"));
        assert!(!is_supported_window("missing"));
        assert!(default_pinned("main"));
        assert!(default_pinned("pet"));
        assert!(default_pinned("search"));
        assert!(!default_pinned("clipboard"));
        assert!(!default_pinned("quickmemory"));
    }

    #[test]
    fn missing_file_uses_default_policy() {
        let path = temp_file("missing-pin-state");
        assert_eq!(resolve_state_from_file(&path, "main").unwrap().pinned, true);
        assert_eq!(resolve_state_from_file(&path, "clipboard").unwrap().pinned, false);
    }

    #[test]
    fn corrupted_file_is_ignored_until_next_write() {
        let path = temp_file("corrupted-pin-state");
        fs::write(&path, "{not json").unwrap();
        assert_eq!(resolve_state_from_file(&path, "search").unwrap().pinned, true);
        let state = set_state_in_file(&path, "search", false).unwrap();
        assert_eq!(state.pinned, false);
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("\"search\": false"));
    }

    #[test]
    fn set_state_persists_per_label_without_affecting_other_windows() {
        let path = temp_file("pin-state");
        set_state_in_file(&path, "clipboard", true).unwrap();
        assert_eq!(resolve_state_from_file(&path, "clipboard").unwrap().pinned, true);
        assert_eq!(resolve_state_from_file(&path, "quickmemory").unwrap().pinned, false);
    }

    #[test]
    fn unsupported_label_returns_clear_error() {
        let path = temp_file("unsupported-pin-state");
        let err = resolve_state_from_file(&path, "screenshot").unwrap_err();
        assert_eq!(err, "window does not support pinning: screenshot");
    }
}
```

- [ ] **Step 2: Run the Rust tests and confirm the module compiles or exposes missing dependencies**

Run:

```bash
cd app/src-tauri
cargo test window_pinning
```

Expected if the local Rust toolchain is current enough: tests pass. If the environment still has `rustc 1.87.0` while dependencies require `rustc 1.88+`, record that as an environment blocker and continue with `npm test` plus `npm run build` later.

- [ ] **Step 3: Add app-data path resolution and public command helpers**

Append these functions below the pure helpers in `window_pinning.rs`:

```rust
use tauri::{Emitter, Manager};

fn state_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(data_dir.join("window-pin-states.json"))
}

fn get_state_for_app(app: &tauri::AppHandle, label: &str) -> Result<WindowPinState, String> {
    let path = state_file_path(app)?;
    resolve_state_from_file(&path, label)
}

fn set_state_for_app(
    app: &tauri::AppHandle,
    label: &str,
    pinned: bool,
) -> Result<WindowPinState, String> {
    let path = state_file_path(app)?;
    set_state_in_file(&path, label, pinned)
}

#[tauri::command]
pub fn get_window_pin_state(
    app: tauri::AppHandle,
    label: String,
) -> Result<WindowPinState, String> {
    get_state_for_app(&app, &label)
}

#[tauri::command]
pub fn list_window_pin_states(app: tauri::AppHandle) -> Result<Vec<WindowPinState>, String> {
    SUPPORTED_WINDOWS
        .iter()
        .map(|label| get_state_for_app(&app, label))
        .collect()
}
```

- [ ] **Step 4: Run the focused Rust tests again**

Run:

```bash
cd app/src-tauri
cargo test window_pinning
```

Expected: the pure model tests still pass, or the same Rust toolchain blocker is documented.

- [ ] **Step 5: Commit the pure Rust pin model**

Run:

```bash
git add app/src-tauri/src/window_pinning.rs
git commit -m "feat: add window pin state model"
```

---

### Task 2: Apply Pin State From Rust

**Files:**
- Modify: `app/src-tauri/src/window_pinning.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add layer application helpers**

Add this code to `window_pinning.rs`:

```rust
#[cfg(target_os = "macos")]
fn prepare_pinned_window_for_current_space(win: &tauri::WebviewWindow) -> Result<(), String> {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    win.set_visible_on_all_workspaces(true)
        .map_err(|e| e.to_string())?;

    let ns_window = win.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;
    let ns_window = unsafe { ns_window.as_ref() }
        .ok_or_else(|| "window ns_window is null".to_string())?;
    let behavior = ns_window.collectionBehavior()
        | NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::Stationary;
    ns_window.setCollectionBehavior(behavior);
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn prepare_pinned_window_for_current_space(_win: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

pub fn apply_window_pin_state(
    app: &tauri::AppHandle,
    label: &str,
) -> Result<WindowPinState, String> {
    let state = get_state_for_app(app, label)?;
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {label}"))?;

    win.set_always_on_top(state.pinned)
        .map_err(|e| e.to_string())?;

    if state.pinned {
        prepare_pinned_window_for_current_space(&win)?;
    }

    Ok(state)
}

#[tauri::command]
pub fn set_window_pin_state(
    app: tauri::AppHandle,
    label: String,
    pinned: bool,
) -> Result<WindowPinState, String> {
    let state = set_state_for_app(&app, &label, pinned)?;
    apply_window_pin_state(&app, &label)?;
    app.emit(WINDOW_PIN_CHANGED_EVENT, state.clone())
        .map_err(|e| e.to_string())?;
    Ok(state)
}

pub fn apply_all_startup_pin_states(app: &tauri::AppHandle) {
    for label in SUPPORTED_WINDOWS {
        let _ = apply_window_pin_state(app, label);
    }
}
```

- [ ] **Step 2: Register module and commands in `lib.rs`**

Modify the module list near the top:

```rust
mod window_pinning;
```

Add these commands inside `tauri::generate_handler![...]`:

```rust
window_pinning::get_window_pin_state,
window_pinning::set_window_pin_state,
window_pinning::list_window_pin_states,
```

Call startup application in `.setup(|app| { ... })` after all window-related setup calls and before showing the pet:

```rust
window_pinning::apply_all_startup_pin_states(app.handle());
let _ = entries::show_pet_window(app.handle().clone(), None);
```

- [ ] **Step 3: Run checks**

Run:

```bash
cd app/src-tauri
cargo test window_pinning
cargo check
```

Expected: tests and check pass, unless blocked by the known local Rust version mismatch.

- [ ] **Step 4: Commit Rust command registration**

Run:

```bash
git add app/src-tauri/src/window_pinning.rs app/src-tauri/src/lib.rs
git commit -m "feat: register window pin commands"
```

---

### Task 3: Route Window Show Paths Through Pin Application

**Files:**
- Modify: `app/src-tauri/src/entries.rs`
- Modify: `app/src-tauri/src/builtins/json.rs`
- Modify: `app/src-tauri/src/builtins/totp.rs`
- Modify: `app/src-tauri/src/builtins/screenshotai.rs`
- Modify: `app/src-tauri/src/builtins/webaccounts.rs`
- Modify: `app/src-tauri/src/builtins/quickmemory.rs`
- Modify: `app/src-tauri/src/builtins/terminal.rs`
- Modify: `app/src-tauri/src/builtins/remotedesk.rs`
- Modify: `app/src-tauri/src/builtins/clipboard.rs`

- [ ] **Step 1: Apply pin state in entry show paths**

In `entries.rs`, import the module:

```rust
use crate::{config, window_pinning};
```

In `show_window`, call `apply_window_pin_state` before `prepare_entry_window_for_current_space`:

```rust
fn show_window(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    let _ = window_pinning::apply_window_pin_state(app, label);
    prepare_entry_window_for_current_space(&win)?;
    show_entry_window(&win)?;
    win.unminimize().map_err(|e| e.to_string())?;
    focus_entry_window(&win)?;
    Ok(())
}
```

In `restore_main_window`, call the same helper after resolving `win`:

```rust
let _ = window_pinning::apply_window_pin_state(app, "main");
```

- [ ] **Step 2: Add a local helper pattern to simple builtin show/toggle files**

For `json.rs`, `totp.rs`, `screenshotai.rs`, `webaccounts.rs`, `quickmemory.rs`, `terminal.rs`, and `remotedesk.rs`, add:

```rust
use crate::window_pinning;

fn apply_pin_state(app: &tauri::AppHandle, label: &str) {
    let _ = window_pinning::apply_window_pin_state(app, label);
}
```

Before each `win.show()` in those files, call:

```rust
apply_pin_state(&app, "json-helper");
```

Use the actual label for each file:

- `json-helper`
- `totp`
- `screenshotai`
- `webaccounts`
- `quickmemory`
- `terminal`
- `remotedesk`

- [ ] **Step 3: Apply pin state in clipboard show path**

In `app/src-tauri/src/builtins/clipboard.rs`, import and use the same helper before showing or focusing the clipboard window:

```rust
use crate::window_pinning;

fn apply_pin_state(app: &tauri::AppHandle, label: &str) {
    let _ = window_pinning::apply_window_pin_state(app, label);
}
```

Inside `show_clipboard_window`, call:

```rust
apply_pin_state(&app, "clipboard");
```

Do the same in the toggle path before `win.show()`.

- [ ] **Step 4: Keep screenshot capture separate**

Do not call `window_pinning::apply_window_pin_state` from `app/src-tauri/src/builtins/screenshot.rs`. The `screenshot` capture window remains forced on top through its existing capture-specific code.

- [ ] **Step 5: Run Rust checks**

Run:

```bash
cd app/src-tauri
cargo check
```

Expected: build passes, unless blocked by the known local Rust version mismatch.

- [ ] **Step 6: Commit show-path integration**

Run:

```bash
git add app/src-tauri/src/entries.rs app/src-tauri/src/builtins
git commit -m "feat: apply pin state when showing windows"
```

---

### Task 4: Add Frontend Pin API And Button

**Files:**
- Create: `app/src/windowPinning.ts`
- Create: `app/src/components/WindowPinButton.tsx`
- Modify: `app/src/icons/controlIcons.tsx`
- Modify: `app/src/icons/icons.test.tsx`

- [ ] **Step 1: Add frontend API helper**

Create `app/src/windowPinning.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

export interface WindowPinState {
  label: string;
  pinned: boolean;
  defaultPinned: boolean;
  supported: boolean;
}

export const WINDOW_PIN_CHANGED_EVENT = "window-pin-changed";

export function getWindowPinState(label: string): Promise<WindowPinState> {
  return invoke<WindowPinState>("get_window_pin_state", { label });
}

export function setWindowPinState(label: string, pinned: boolean): Promise<WindowPinState> {
  return invoke<WindowPinState>("set_window_pin_state", { label, pinned });
}
```

- [ ] **Step 2: Add a pin icon**

Append to `app/src/icons/controlIcons.tsx`:

```tsx
export function PinIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.settings)}>
      <path d="M8.5 4.5h7l-.9 4.6 3.2 3.2-2 2-3.2-3.2L8 12l-3.5 3.5" />
      <path d="m9.6 14.4-3.9 3.9" opacity={0.65} />
    </IconBase>
  );
}
```

In `app/src/icons/icons.test.tsx`, add `PinIcon` to the import list and render list:

```tsx
import { CloseIcon, MinimizeIcon, PinIcon } from "@/icons";

<PinIcon size={32} />
```

- [ ] **Step 3: Add `WindowPinButton`**

Create `app/src/components/WindowPinButton.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PinIcon } from "@/icons";
import {
  getWindowPinState,
  setWindowPinState,
  WINDOW_PIN_CHANGED_EVENT,
  type WindowPinState,
} from "@/windowPinning";

interface WindowPinButtonProps {
  style?: CSSProperties;
}

const buttonStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.72)",
  display: "grid",
  placeItems: "center",
  padding: 0,
  cursor: "pointer",
};

export function WindowPinButton({ style }: WindowPinButtonProps) {
  const label = getCurrentWindow().label;
  const [state, setState] = useState<WindowPinState | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWindowPinState(label)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });

    let unlisten: (() => void) | null = null;
    listen<WindowPinState>(WINDOW_PIN_CHANGED_EVENT, (event) => {
      if (event.payload.label === label) {
        setState(event.payload);
      }
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [label]);

  if (!state?.supported) return null;

  const title = state.pinned ? "取消置顶" : "置顶";
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setWindowPinState(label, !state.pinned)
      .then(setState)
      .catch(console.error);
  };

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      data-tauri-drag-region="false"
      onClick={handleClick}
      style={{
        ...buttonStyle,
        background: state.pinned ? "rgba(96,165,250,0.22)" : buttonStyle.background,
        color: state.pinned ? "rgba(191,219,254,0.96)" : buttonStyle.color,
        ...style,
      }}
    >
      <PinIcon size={14} decorative />
    </button>
  );
}
```

- [ ] **Step 4: Run frontend icon and type checks**

Run:

```bash
cd app
npm test -- src/icons/icons.test.tsx
npm run build
```

Expected: icon test and TypeScript build pass.

- [ ] **Step 5: Commit frontend pin button foundation**

Run:

```bash
git add app/src/windowPinning.ts app/src/components/WindowPinButton.tsx app/src/icons/controlIcons.tsx app/src/icons/icons.test.tsx
git commit -m "feat: add window pin button"
```

---

### Task 5: Integrate Pin Button Into Window Chrome

**Files:**
- Modify: `app/src/components/MacWindowControls.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/entry/PetEntryApp.tsx`
- Modify: `app/src/builtins/quickmemory/App.tsx`

- [ ] **Step 1: Add optional pin control to `MacWindowControls`**

Modify `app/src/components/MacWindowControls.tsx`:

```tsx
import { WindowPinButton } from "@/components/WindowPinButton";

interface MacWindowControlsProps {
  onClose: () => void;
  onMinimize?: () => void;
  closeTitle?: string;
  minimizeTitle?: string;
  showPin?: boolean;
  style?: CSSProperties;
}

export function MacWindowControls({
  onClose,
  onMinimize,
  closeTitle = "关闭",
  minimizeTitle = "最小化",
  showPin = true,
  style,
}: MacWindowControlsProps) {
  const [hovered, setHovered] = useState<"close" | "minimize" | null>(null);

  return (
    <div
      data-tauri-drag-region="false"
      style={{ display: "flex", gap: 8, alignItems: "center", ...style }}
    >
      {showPin && <WindowPinButton style={{ marginRight: 2 }} />}
      {/* keep existing close and minimize buttons unchanged below */}
    </div>
  );
}
```

Preserve the existing close and minimize button JSX after the pin button.

- [ ] **Step 2: Use default pin button in existing `MacWindowControls` call sites**

No code change is needed for these call sites because `showPin` defaults to `true`:

- `app/src/App.tsx`
- `app/src/entry/SearchPanel.tsx`
- `app/src/components/SettingsPanel.tsx`
- `app/src/builtins/clipboard/App.tsx`
- `app/src/builtins/json/App.tsx`
- `app/src/builtins/totp/App.tsx`
- `app/src/builtins/screenshotai/App.tsx`
- `app/src/builtins/remotedesk/App.tsx`
- `app/src/builtins/terminal/App.tsx`

If any screenshot capture overlay uses `MacWindowControls`, pass `showPin={false}`. In the current codebase the capture overlay does not use `MacWindowControls`.

- [ ] **Step 3: Add pin control to the pet window**

In `app/src/entry/PetEntryApp.tsx`, import the button:

```tsx
import { WindowPinButton } from "@/components/WindowPinButton";
```

Render it near the status badge or menu controls, with compact sizing:

```tsx
<WindowPinButton
  style={{
    position: "absolute",
    left: 2,
    bottom: 0,
    zIndex: 8,
    width: 22,
    height: 20,
  }}
/>
```

Do not put the pin button inside the animated cat image. Keep `data-tauri-drag-region="false"` on the button so clicks toggle pin instead of dragging the pet.

- [ ] **Step 4: Add pin control to quickmemory custom chrome**

In `app/src/builtins/quickmemory/App.tsx`, import:

```tsx
import { WindowPinButton } from "@/components/WindowPinButton";
```

Place `<WindowPinButton />` next to the close button in the top-right control area:

```tsx
<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <WindowPinButton />
  <button
    type="button"
    onClick={handleClose}
    title="关闭 (Esc)"
    data-tauri-drag-region="false"
    style={closeButtonStyle}
  >
    ×
  </button>
</div>
```

Keep the existing close button behavior unchanged.

- [ ] **Step 5: Run frontend tests and build**

Run:

```bash
cd app
npm test
npm run build
```

Expected: all Vitest tests and TypeScript build pass.

- [ ] **Step 6: Commit UI integration**

Run:

```bash
git add app/src/components/MacWindowControls.tsx app/src/App.tsx app/src/entry/PetEntryApp.tsx app/src/builtins/quickmemory/App.tsx
git commit -m "feat: show pin controls in windows"
```

---

### Task 6: Migrate Startup `alwaysOnTop` Defaults

**Files:**
- Modify: `app/src-tauri/tauri.conf.json`

- [ ] **Step 1: Update tool window startup flags**

Change these tool windows from `"alwaysOnTop": true` to `"alwaysOnTop": false`:

- `clipboard`
- `json-helper`
- `totp`
- `remotedesk`
- `screenshotai`
- `webaccounts`

Keep these values as `true`:

- `main`
- `search`
- `pet`
- `screenshot`

Keep these values as `false`:

- `terminal`
- `quickmemory`

- [ ] **Step 2: Validate config JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('app/src-tauri/tauri.conf.json','utf8')); console.log('tauri.conf.json ok')"
```

Expected:

```text
tauri.conf.json ok
```

- [ ] **Step 3: Run build**

Run:

```bash
cd app
npm run build
```

Expected: Vite build and TypeScript compile pass.

- [ ] **Step 4: Commit config migration**

Run:

```bash
git add app/src-tauri/tauri.conf.json
git commit -m "chore: let pin service control tool layers"
```

---

### Task 7: Manual macOS QA And Final Verification

**Files:**
- No source file changes expected.

- [ ] **Step 1: Start DevLauncher in dev mode**

Run:

```bash
npm run tauri:dev:mac
```

Expected: DevLauncher starts and the pet appears.

- [ ] **Step 2: Verify default pin policy**

Manual checks:

- `main`, `pet`, and `search` open pinned by default.
- `clipboard`, `json-helper`, `totp`, `remotedesk`, `terminal`, `screenshotai`, `webaccounts`, and `quickmemory` open unpinned by default.
- `screenshot` capture overlay remains above the desktop during capture and has no normal pin toggle.

- [ ] **Step 3: Verify per-window persistence**

Manual sequence:

1. Open `clipboard`.
2. Click the pin button until tooltip says `取消置顶`.
3. Open Chrome or Finder and confirm `clipboard` stays above it.
4. Restart DevLauncher.
5. Open `clipboard` again and confirm it is still pinned.
6. Open `quickmemory` and confirm it did not inherit the clipboard pin state.

- [ ] **Step 4: Verify unpin behavior**

Manual sequence:

1. Open `clipboard`.
2. Click the pin button until tooltip says `置顶`.
3. Click Codex, Chrome, or Finder.
4. Confirm the other app can cover `clipboard`.

- [ ] **Step 5: Run final automated checks**

Run:

```bash
cd app
npm test
npm run build
cd src-tauri
cargo test window_pinning
cargo check
```

Expected:

- `npm test` passes.
- `npm run build` passes.
- Rust checks pass if the local Rust version satisfies dependency requirements.
- If Rust is blocked by `rustc 1.87.0` needing `rustc 1.88+`, record the exact error and leave the TypeScript checks as completed evidence.

- [ ] **Step 6: Commit final QA note if docs changed**

If QA notes are added to a document, commit them:

```bash
git add docs/superpowers/plans/2026-06-19-window-pin-layering.md
git commit -m "docs: record window pin qa"
```

If no files changed during QA, do not create an empty commit.

---

## Self-Review

- Spec coverage: the plan covers supported labels, default policy, persistence, Rust commands, runtime layer application, frontend shared control, event sync, startup config migration, screenshot capture separation, automated checks, and manual macOS QA.
- Marker scan: no unresolved marker text or vague implementation notes remain.
- Type consistency: the Rust `WindowPinState` serializes camelCase for the frontend `WindowPinState` interface; command names match `get_window_pin_state`, `set_window_pin_state`, and `list_window_pin_states`; event name is consistently `window-pin-changed`.
