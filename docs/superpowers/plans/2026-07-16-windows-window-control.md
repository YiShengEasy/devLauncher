# Windows Main Window Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows double-Ctrl, close-to-tray, minimize, restore-to-front, tray, single-instance, and pin actions reliable without changing macOS window behavior.

**Architecture:** Use the Tauri main-thread event queue as the single serialized window-action executor. A focused Rust module owns semantic main-window actions and uses synchronous Win32 state/mutation APIs only behind `cfg(target_os = "windows")`; non-Windows actions delegate to the existing Tauri/macOS behavior. Frontend controls invoke semantic backend commands instead of directly mutating the main window.

**Tech Stack:** Rust, Tauri 2, `windows-sys` 0.61, React, TypeScript.

---

## Scope and existing work

The working tree already contains user-requested, uncommitted changes in:

- `app/src-tauri/src/builtins/clipboard.rs`
- `app/src-tauri/src/entries.rs`
- `app/src-tauri/src/keyboard_control_tap.rs`
- `app/src/App.tsx`
- `app/src/components/KeyboardPanel.tsx`

Keep the clipboard retry, header drag region, removed outer shadow, Windows shortcut text, and keyboard-height correction. Replace only the superseded window-toggle code in `entries.rs` and the per-toggle thread creation in `keyboard_control_tap.rs`.

Per the user's instruction, do not launch the application and do not automate window interaction. The user will test double Ctrl, close, minimize, foreground, and pin behavior manually. Only static, encoding, and compile checks are allowed.

## File map

- Create `app/src-tauri/src/main_window_control.rs`: semantic action model, main-thread serialization, Windows HWND implementation, and Tauri fallback.
- Create `app/src/mainWindowControl.ts`: typed frontend wrappers for hide-to-tray and minimize actions.
- Modify `app/src-tauri/src/lib.rs`: register the module/command and route global shortcut, tray, and single-instance events.
- Modify `app/src-tauri/src/entries.rs`: remove the provisional Windows async toggle path and delegate main-window actions to the controller while preserving entry/pet behavior.
- Modify `app/src-tauri/src/keyboard_control_tap.rs`: keep double-Ctrl recognition, remove one-thread-per-toggle behavior, and enqueue one semantic toggle action.
- Modify `app/src-tauri/src/window_pinning.rs`: apply Windows pinning with `SetWindowPos` and keep macOS Tauri pinning unchanged.
- Modify `app/src/App.tsx`: route red/yellow controls through semantic commands.
- Modify `app/src/icons/controlIcons.tsx`: replace the decorative document pin with the existing simple pushpin geometry.
- Modify `app/src/builtins/screenshot/App.tsx`: reuse the shared `PinIcon` and delete the local duplicate SVG.

### Task 1: Add the serialized main-window controller

**Files:**
- Create: `app/src-tauri/src/main_window_control.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Define semantic actions and the frontend command**

Create a small action type and parse only the three actions the frontend may request. `Toggle` remains backend-only for shortcuts and tray clicks.

```rust
#[derive(Clone, Copy, Debug)]
pub enum MainWindowAction {
    Toggle,
    Show,
    Hide,
    Minimize,
}

impl MainWindowAction {
    fn from_command(action: &str) -> Result<Self, String> {
        match action {
            "show" => Ok(Self::Show),
            "hide" => Ok(Self::Hide),
            "minimize" => Ok(Self::Minimize),
            _ => Err(format!("unsupported main window action: {action}")),
        }
    }
}

#[tauri::command]
pub fn control_main_window(app: tauri::AppHandle, action: String) -> Result<(), String> {
    dispatch(&app, MainWindowAction::from_command(&action)?)
}
```

- [ ] **Step 2: Serialize every action on Tauri's main-thread queue**

Implement one non-blocking dispatcher. The keyboard hook must call this directly; it must not create its own worker thread.

```rust
pub fn dispatch(app: &tauri::AppHandle, action: MainWindowAction) -> Result<(), String> {
    let app = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = execute(&app, action) {
            eprintln!("main window action {action:?} failed: {error}");
        }
    })
    .map_err(|error| error.to_string())
}
```

This queue is the serialization boundary: callers never query visibility before dispatching and never mutate the main window after dispatching.

Also add an awaitable helper for operations such as pinning, where the caller must receive the result before persisting state or updating the UI:

```rust
pub async fn run_serialized<T, F>(
    app: &tauri::AppHandle,
    operation: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(operation());
    })
    .map_err(|error| error.to_string())?;
    receiver
        .await
        .map_err(|_| "serialized window action was cancelled".to_string())?
}
```

Both helpers use the same Tauri event-loop queue. `dispatch` is for hook/tray callbacks that must return immediately; `run_serialized` is for async commands that must report success or failure.

- [ ] **Step 3: Implement Windows HWND state transitions**

Under `#[cfg(target_os = "windows")]`, obtain the `main` HWND once per action and use native state as the source of truth.

```rust
#[cfg(target_os = "windows")]
fn execute(app: &tauri::AppHandle, action: MainWindowAction) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow,
        SW_HIDE, SW_MINIMIZE, SW_RESTORE, SW_SHOW,
    };

    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "window not found: main".to_string())?;
    let hwnd = win.hwnd().map_err(|error| error.to_string())?.0;
    let visible = unsafe { IsWindowVisible(hwnd) != 0 };
    let minimized = unsafe { IsIconic(hwnd) != 0 };

    let resolved = match action {
        MainWindowAction::Toggle if visible && !minimized => MainWindowAction::Hide,
        MainWindowAction::Toggle => MainWindowAction::Show,
        other => other,
    };

    match resolved {
        MainWindowAction::Show => {
            crate::window_pinning::apply_window_pin_state(app, "main")?;
            unsafe {
                ShowWindow(hwnd, if minimized { SW_RESTORE } else { SW_SHOW });
                BringWindowToTop(hwnd);
                SetForegroundWindow(hwnd);
            }
        }
        MainWindowAction::Hide => unsafe {
            ShowWindow(hwnd, SW_HIDE);
        },
        MainWindowAction::Minimize => unsafe {
            ShowWindow(hwnd, SW_MINIMIZE);
        },
        MainWindowAction::Toggle => unreachable!("toggle is resolved before execution"),
    }

    Ok(())
}
```

`ShowWindow` is intentionally synchronous. Do not reintroduce `ShowWindowAsync` or a visibility query outside this function.

- [ ] **Step 4: Preserve the non-Windows implementation**

Under `#[cfg(not(target_os = "windows"))]`, keep Tauri/macOS semantics. Call the existing `entries::restore_main_window` for showing because it already preserves macOS Spaces and `orderFrontRegardless` behavior.

```rust
#[cfg(not(target_os = "windows"))]
fn execute(app: &tauri::AppHandle, action: MainWindowAction) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "window not found: main".to_string())?;
    let visible = win.is_visible().map_err(|error| error.to_string())?;
    let minimized = win.is_minimized().map_err(|error| error.to_string())?;
    let resolved = match action {
        MainWindowAction::Toggle if visible && !minimized => MainWindowAction::Hide,
        MainWindowAction::Toggle => MainWindowAction::Show,
        other => other,
    };

    match resolved {
        MainWindowAction::Show => crate::entries::restore_main_window(app),
        MainWindowAction::Hide => win.hide().map_err(|error| error.to_string()),
        MainWindowAction::Minimize => win.minimize().map_err(|error| error.to_string()),
        MainWindowAction::Toggle => unreachable!("toggle is resolved before execution"),
    }
}
```

- [ ] **Step 5: Register the module and command**

Add `mod main_window_control;` in `lib.rs` and add `main_window_control::control_main_window` to `tauri::generate_handler!`.

- [ ] **Step 6: Compile-check the controller without running the app**

Run:

```powershell
cargo check --manifest-path app/src-tauri/Cargo.toml
```

Expected: exit code `0`; no duplicate command, missing Win32 symbol, ownership, or `Send` errors.

- [ ] **Step 7: Commit the controller boundary**

Stage only the controller and command registration:

```powershell
git add app/src-tauri/src/main_window_control.rs app/src-tauri/src/lib.rs
git commit -m "refactor: serialize main window controls"
```

### Task 2: Route all main-window triggers through the controller

**Files:**
- Modify: `app/src-tauri/src/main_window_control.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/src/entries.rs`
- Modify: `app/src-tauri/src/keyboard_control_tap.rs`

- [ ] **Step 1: Remove the provisional Win32 show/toggle code from `entries.rs`**

Restore `show_entry_window` to its two established platform groups: macOS keeps `orderFrontRegardless`; every non-macOS entry window uses Tauri `show`. Delete the provisional `ShowWindowAsync`, `IsWindowVisible`, and `IsIconic` blocks from this file so the only main-window Win32 mutations live in `main_window_control.rs`.

```rust
#[cfg(not(target_os = "macos"))]
fn show_entry_window(win: &tauri::WebviewWindow) -> Result<(), String> {
    win.show().map_err(|error| error.to_string())
}
```

Change only the visibility of the existing pet companion helper so the controller can preserve current toggle behavior:

```rust
pub(crate) fn show_pet_for_keyboard(app: &tauri::AppHandle) -> Result<(), String> {
    show_window(app, "pet")
}
```

- [ ] **Step 2: Preserve companion behavior when a toggle resolves to show**

In the Windows executor, remember whether the original action was a hidden/minimized `Toggle`. After restoring and foregrounding the main window, show the existing pet companion through the helper above:

```rust
let show_pet_after_show =
    matches!(action, MainWindowAction::Toggle) && (!visible || minimized);

// Resolve Toggle to Show/Hide, then execute the native main-window action.

if show_pet_after_show {
    crate::entries::show_pet_for_keyboard(app)?;
}
```

Place the helper call only in the resolved `Show` branch, after `ShowWindow`, `BringWindowToTop`, and `SetForegroundWindow`.

In the non-Windows executor, do not discard the distinction between `Toggle` and `Show`. Preserve the existing macOS keyboard-toggle path exactly:

```rust
match action {
    MainWindowAction::Toggle if visible && !minimized => {
        win.hide().map_err(|error| error.to_string())
    }
    MainWindowAction::Toggle => crate::entries::show_keyboard_window(app.clone(), None),
    MainWindowAction::Show => crate::entries::restore_main_window(app),
    MainWindowAction::Hide => win.hide().map_err(|error| error.to_string()),
    MainWindowAction::Minimize => win.minimize().map_err(|error| error.to_string()),
}
```

This keeps macOS Spaces/focus behavior and the existing companion-window behavior unchanged.

- [ ] **Step 3: Make the existing keyboard toggle wrapper enqueue one action**

Keep the current function signature so macOS hook code and global shortcut call sites remain source-compatible.

```rust
pub fn toggle_keyboard_window(app: tauri::AppHandle) -> Result<(), String> {
    set_pet_action(&app, "cozy");
    crate::main_window_control::dispatch(
        &app,
        crate::main_window_control::MainWindowAction::Toggle,
    )
}
```

Do not call `win.is_visible()`, `win.hide()`, or `show_keyboard_window()` in this wrapper.

- [ ] **Step 4: Remove one-thread-per-double-Ctrl on Windows**

Keep the current 550 ms key-up recognizer, injected-event rejection, and other-key cancellation. Replace only the spawned thread block:

```rust
if state.register_control_release(Instant::now()) {
    if let Some(app) = APP_HANDLE.get() {
        let _ = entries::toggle_keyboard_window(app.clone());
    }
}
```

The hook callback now performs only a channel/event-loop enqueue and returns immediately.

- [ ] **Step 5: Route global shortcut, tray, and single-instance events**

In `lib.rs`:

- Single instance callback dispatches `Show`.
- Keyboard global shortcut keeps calling `entries::toggle_keyboard_window`, which now dispatches `Toggle`.
- Tray `show` and `settings` dispatch `Show`.
- Tray left click dispatches `Toggle` without reading `win.is_visible()`.
- macOS `RunEvent::Reopen` dispatches `Show`; the non-Windows executor still calls the existing macOS restore function.

Use this call shape at every direct source:

```rust
let _ = main_window_control::dispatch(
    app,
    main_window_control::MainWindowAction::Show,
);
```

For the tray click handler, pass `tray.app_handle()` and `MainWindowAction::Toggle` directly; delete the `get_webview_window` visibility branch.

- [ ] **Step 6: Confirm there is one main-window state source**

Run:

```powershell
rg -n "ShowWindowAsync|IsWindowVisible|IsIconic|std::thread::spawn" app/src-tauri/src/entries.rs app/src-tauri/src/keyboard_control_tap.rs app/src-tauri/src/main_window_control.rs
```

Expected:

- `IsWindowVisible` and `IsIconic` occur only in `main_window_control.rs`.
- `ShowWindowAsync` has no match in these files.
- `std::thread::spawn` may remain only for the long-lived Windows hook installation thread, not inside the double-Ctrl callback.

- [ ] **Step 7: Commit the trigger migration**

```powershell
git add app/src-tauri/src/main_window_control.rs app/src-tauri/src/lib.rs app/src-tauri/src/entries.rs app/src-tauri/src/keyboard_control_tap.rs
git commit -m "fix: unify Windows main window triggers"
```

### Task 3: Route the main header buttons through semantic commands

**Files:**
- Create: `app/src/mainWindowControl.ts`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Add typed frontend wrappers**

```ts
import { invoke } from "@tauri-apps/api/core";

type MainWindowAction = "show" | "hide" | "minimize";

function controlMainWindow(action: MainWindowAction): Promise<void> {
  return invoke<void>("control_main_window", { action });
}

export function hideMainWindowToTray(): Promise<void> {
  return controlMainWindow("hide");
}

export function minimizeMainWindow(): Promise<void> {
  return controlMainWindow("minimize");
}
```

- [ ] **Step 2: Replace direct Tauri mutations in the main header**

Import the two wrappers in `App.tsx`. Preserve `setPetActionState("cozy")`, titles, drag-region attributes, shadow removal, and Windows shortcut hint.

```tsx
<MacWindowControls
  onClose={() => {
    setPetActionState("cozy");
    hideMainWindowToTray().catch(console.error);
  }}
  onMinimize={() => {
    setPetActionState("cozy");
    minimizeMainWindow().catch(console.error);
  }}
  closeTitle="Hide to tray"
  minimizeTitle="Minimize"
/>
```

Remove the now-unused `getCurrentWindow` import from `App.tsx` only if no other code in that file uses it.

- [ ] **Step 3: Type-check/build without launching**

Run from `app`:

```powershell
npm run build
```

Expected: exit code `0`; TypeScript resolves both wrappers and the Tauri command name.

- [ ] **Step 4: Commit the frontend control path**

```powershell
git add app/src/mainWindowControl.ts app/src/App.tsx
git commit -m "fix: route main window buttons through backend"
```

### Task 4: Make Windows pinning native and reuse the simple pin icon

**Files:**
- Modify: `app/src-tauri/src/window_pinning.rs`
- Modify: `app/src/icons/controlIcons.tsx`
- Modify: `app/src/builtins/screenshot/App.tsx`
- Preserve: `app/src/components/WindowPinButton.tsx` button dimensions and styling

- [ ] **Step 1: Isolate the platform-specific pin operation**

Add a Windows implementation using HWND and keep the existing Tauri call on non-Windows platforms.

```rust
#[cfg(target_os = "windows")]
fn apply_always_on_top(win: &tauri::WebviewWindow, pinned: bool) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };

    let hwnd = win.hwnd().map_err(|error| error.to_string())?.0;
    let insert_after = if pinned { HWND_TOPMOST } else { HWND_NOTOPMOST };
    let ok = unsafe {
        SetWindowPos(
            hwnd,
            insert_after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
    };
    if ok == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn apply_always_on_top(win: &tauri::WebviewWindow, pinned: bool) -> Result<(), String> {
    win.set_always_on_top(pinned)
        .map_err(|error| error.to_string())
}
```

Call `apply_always_on_top(&win, state.pinned)?` from `apply_window_pin_state`. Keep the macOS `prepare_pinned_window_for_current_space` call unchanged.

- [ ] **Step 2: Serialize explicit pin changes, then persist**

Make `set_window_pin_state` asynchronous and execute the native/Tauri layer change, persistence write, and event emission together through `main_window_control::run_serialized`. This prevents pin clicks from racing with show/restore and prevents a failed native call from leaving an incorrect persisted value.

```rust
#[tauri::command]
pub async fn set_window_pin_state(
    app: tauri::AppHandle,
    label: String,
    pinned: bool,
) -> Result<WindowPinState, String> {
    if !is_supported_window(&label) {
        return Err(format!("window does not support pinning: {label}"));
    }

    let operation_app = app.clone();
    crate::main_window_control::run_serialized(&app, move || {
        let win = operation_app
            .get_webview_window(&label)
            .ok_or_else(|| format!("window not found: {label}"))?;
        apply_always_on_top(&win, pinned)?;
        if pinned {
            prepare_pinned_window_for_current_space(&win)?;
        }
        let state = set_state_for_app(&operation_app, &label, pinned)?;
        operation_app
            .emit(WINDOW_PIN_CHANGED_EVENT, state.clone())
            .map_err(|error| error.to_string())?;
        Ok(state)
    })
    .await
}
```

- [ ] **Step 3: Replace `PinIcon` with the approved geometry**

Keep the existing shared export name so `WindowPinButton` requires no behavioral changes.

```tsx
export function PinIcon(props: IconProps) {
  return (
    <IconBase {...props} strokeWidth={1.9}>
      <path d="M8 4h8l-1 5 4 4v2H5v-2l4-4L8 4z" strokeLinejoin="round" />
      <path d="M12 15v6" strokeLinecap="round" />
    </IconBase>
  );
}
```

Do not apply `withIconColor`; the screenshot reference uses `currentColor`, allowing the existing active/inactive button color to control the icon.

- [ ] **Step 4: Reuse the shared icon in the screenshot toolbar**

Add `PinIcon` to the existing import from `@/icons/controlIcons`, delete local `IconPinToScreen`, and replace:

```tsx
<IconPinToScreen />
```

with:

```tsx
<PinIcon size={20} decorative />
```

- [ ] **Step 5: Compile-check pinning and shared icon use**

Run:

```powershell
cargo check --manifest-path app/src-tauri/Cargo.toml
npm --prefix app run build
```

Expected: both commands exit `0`; `SetWindowPos` constants resolve and no local `IconPinToScreen` reference remains.

- [ ] **Step 6: Commit pin behavior and icon reuse**

```powershell
git add app/src-tauri/src/window_pinning.rs app/src/icons/controlIcons.tsx app/src/builtins/screenshot/App.tsx
git commit -m "fix: apply native Windows pin state"
```

### Task 5: Preserve prior work and perform non-interactive verification

**Files:**
- Verify: all files changed by Tasks 1-4
- Preserve and commit: `app/src-tauri/src/builtins/clipboard.rs`, `app/src/components/KeyboardPanel.tsx`

- [ ] **Step 1: Check UTF-8 and line endings**

Run:

```powershell
.\scripts\check-utf8.ps1
git diff --check
```

Expected: UTF-8 check passes and `git diff --check` reports no whitespace errors. Do not interpret garbled PowerShell rendering as corrupted source without byte-level evidence.

- [ ] **Step 2: Confirm platform isolation statically**

Run:

```powershell
rg -n "windows_sys|ShowWindow|IsWindowVisible|IsIconic|SetForegroundWindow|SetWindowPos" app/src-tauri/src/main_window_control.rs app/src-tauri/src/window_pinning.rs app/src-tauri/src/entries.rs
rg -n "cfg\(target_os = \"windows\"\)|cfg\(not\(target_os = \"windows\"\)\)" app/src-tauri/src/main_window_control.rs app/src-tauri/src/window_pinning.rs
```

Expected: Win32 calls occur only inside Windows-gated functions; `entries.rs` contains no main-window Win32 state mutation.

- [ ] **Step 3: Confirm all main-window UI/event sources use the controller**

Run:

```powershell
rg -n "getCurrentWindow\(\)\.(hide|minimize)|win\.is_visible\(\)|toggle_keyboard_window|control_main_window|MainWindowAction" app/src/App.tsx app/src-tauri/src/lib.rs app/src-tauri/src/entries.rs app/src-tauri/src/keyboard_control_tap.rs app/src-tauri/src/main_window_control.rs
```

Expected:

- No direct `getCurrentWindow().hide()` or `.minimize()` remains in the main `App.tsx` header.
- Tray left click has no visibility query.
- Shortcut and double-Ctrl paths dispatch `Toggle`.
- Red close dispatches `hide`; yellow minimize dispatches `minimize`.

- [ ] **Step 4: Run final compile checks only**

Run:

```powershell
cargo check --manifest-path app/src-tauri/Cargo.toml
npm --prefix app run build
```

Expected: both exit `0`. Do not launch `app.exe`, do not simulate keyboard input, and do not click the controls.

- [ ] **Step 5: Commit the preserved clipboard and keyboard-layout fixes**

The clipboard retry and restored keyboard height are already-requested changes and must not be lost while the overlapping window-control files are rewritten.

```powershell
git add app/src-tauri/src/builtins/clipboard.rs app/src/components/KeyboardPanel.tsx
git commit -m "fix: preserve Windows clipboard and keyboard layout updates"
```

- [ ] **Step 6: Review the final working tree**

Run:

```powershell
git status --short
git diff --stat
git log -5 --oneline
```

Expected: the working tree is clean except for any unrelated user changes discovered during execution. Report the exact commits and leave runtime verification to the user.
