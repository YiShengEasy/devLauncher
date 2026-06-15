# Entry Mode Switch Pixel Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a smooth two-way switch between virtual keyboard mode and pixel-cat pet mode, add draggable persisted positions for both modes, and correct launcher show/hide behavior so windows do not appear or disappear unexpectedly.

**Architecture:** Keep the current two-window Tauri model for this iteration: `main` remains the virtual keyboard window and `pet` remains the desktop pet window. Add a small shared frontend entry-mode layer for position persistence, transition animation state, and switch actions; add narrowly scoped Rust commands only where one window must show, hide, or position another window.

**Tech Stack:** Tauri v2, React, TypeScript, localStorage for window coordinates, Tauri window APIs, Rust commands in `src-tauri/src/entries.rs`, Vitest for frontend utility tests, `cargo check` for backend validation.

---

## File Structure

- Modify `app/src-tauri/src/entries.rs`
  - Add explicit entry-mode commands: `show_pet_window`, `show_keyboard_window`, `switch_to_pet_mode`, `switch_to_keyboard_mode`.
  - Ensure mode switch hides the source window and shows/focuses the target window.
  - Accept optional target coordinates from the frontend so switching can feel spatially continuous.
- Modify `app/src-tauri/src/lib.rs`
  - Register new entry-mode commands.
- Modify `app/src-tauri/capabilities/default.json`
  - Add required window permissions if new frontend calls need position or drag APIs.
- Create `app/src/entry/windowPosition.ts`
  - Persist and restore per-mode coordinates under keys for `main` and `pet`.
  - Clamp restored positions to sane numeric values.
- Create `app/src/entry/windowPosition.test.ts`
  - Cover serialization, corrupted values, and coordinate clamping.
- Modify `app/src/App.tsx`
  - Replace the current static DevLauncher image with a small pixel-cat mode-switch button in the title bar.
  - Add exit animation before invoking `switch_to_pet_mode`.
  - Restore/save keyboard window position.
  - Replace `Alt+Space` behavior with keyboard-mode-aware logic that does not leave pet and keyboard open together.
- Modify `app/src/entry/PetEntryApp.tsx`
  - Add a `键盘` ring item that switches back to keyboard mode.
  - Make the pet draggable and persist its final coordinates.
  - Add enter/exit animation states for switching and for ring open/close.
  - Change feature actions from toggle semantics to explicit show semantics wherever available.
- Modify `app/src-tauri/src/builtins/clipboard.rs`
  - Add `show_clipboard_window` so pet `剪贴` does not accidentally close an already open clipboard window.
- Modify `app/src-tauri/src/lib.rs`
  - Register `show_clipboard_window`.
- Modify `app/src/components/SettingsPanel.tsx`
  - Update entry shortcut text to describe keyboard/pet switching and drag persistence.

---

### Task 1: Add Window Position Persistence Utility

**Files:**
- Create: `app/src/entry/windowPosition.ts`
- Create: `app/src/entry/windowPosition.test.ts`

- [ ] **Step 1: Write the failing utility tests**

Create `app/src/entry/windowPosition.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTRY_POSITION_STORAGE_KEY,
  getStoredEntryPosition,
  setStoredEntryPosition,
  type EntryWindowMode,
} from "./windowPosition";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

describe("windowPosition", () => {
  it("stores and reads coordinates by mode", () => {
    setStoredEntryPosition("pet", { x: 120, y: 240 });

    expect(getStoredEntryPosition("pet")).toEqual({ x: 120, y: 240 });
    expect(getStoredEntryPosition("main")).toBeNull();
  });

  it("ignores corrupted storage", () => {
    localStorage.setItem(ENTRY_POSITION_STORAGE_KEY, "{bad json");

    expect(getStoredEntryPosition("pet")).toBeNull();
  });

  it("ignores invalid mode values", () => {
    localStorage.setItem(ENTRY_POSITION_STORAGE_KEY, JSON.stringify({
      pet: { x: "left", y: 20 },
    }));

    expect(getStoredEntryPosition("pet")).toBeNull();
  });

  it("preserves other modes when setting one mode", () => {
    const modes: EntryWindowMode[] = ["main", "pet"];
    setStoredEntryPosition(modes[0], { x: 10, y: 20 });
    setStoredEntryPosition(modes[1], { x: 30, y: 40 });

    expect(getStoredEntryPosition("main")).toEqual({ x: 10, y: 20 });
    expect(getStoredEntryPosition("pet")).toEqual({ x: 30, y: 40 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/entry/windowPosition.test.ts`

Expected: FAIL because `windowPosition.ts` does not exist.

- [ ] **Step 3: Implement the utility**

Create `app/src/entry/windowPosition.ts`:

```ts
export type EntryWindowMode = "main" | "pet";

export interface EntryWindowPosition {
  x: number;
  y: number;
}

export const ENTRY_POSITION_STORAGE_KEY = "devlauncher.entryWindowPositions";

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readAllPositions(): Partial<Record<EntryWindowMode, EntryWindowPosition>> {
  if (typeof localStorage === "undefined") return {};

  try {
    const raw = localStorage.getItem(ENTRY_POSITION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<EntryWindowMode, EntryWindowPosition>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getStoredEntryPosition(mode: EntryWindowMode): EntryWindowPosition | null {
  const value = readAllPositions()[mode];
  if (!value || !isFiniteCoordinate(value.x) || !isFiniteCoordinate(value.y)) return null;
  return { x: Math.round(value.x), y: Math.round(value.y) };
}

export function setStoredEntryPosition(mode: EntryWindowMode, position: EntryWindowPosition): void {
  if (typeof localStorage === "undefined") return;
  if (!isFiniteCoordinate(position.x) || !isFiniteCoordinate(position.y)) return;

  const next = {
    ...readAllPositions(),
    [mode]: {
      x: Math.round(position.x),
      y: Math.round(position.y),
    },
  };
  localStorage.setItem(ENTRY_POSITION_STORAGE_KEY, JSON.stringify(next));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/entry/windowPosition.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/entry/windowPosition.ts app/src/entry/windowPosition.test.ts
git commit -m "feat: persist entry window positions"
```

---

### Task 2: Add Explicit Entry Window Commands

**Files:**
- Modify: `app/src-tauri/src/entries.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add Rust commands**

Modify `app/src-tauri/src/entries.rs`:

```rust
use tauri::Manager;

#[derive(Debug, serde::Deserialize)]
pub struct EntryWindowPosition {
    pub x: i32,
    pub y: i32,
}

fn show_window(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn set_position_if_present(
    app: &tauri::AppHandle,
    label: &str,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    let Some(position) = position else {
        return Ok(());
    };
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    win.set_position(tauri::PhysicalPosition::new(position.x, position.y))
        .map_err(|e| e.to_string())
}

fn hide_window_if_present(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(label) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn show_pet_window(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    set_position_if_present(&app, "pet", position)?;
    show_window(&app, "pet")
}

#[tauri::command]
pub fn show_keyboard_window(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    set_position_if_present(&app, "main", position)?;
    show_window(&app, "main")
}

#[tauri::command]
pub fn switch_to_pet_mode(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    set_position_if_present(&app, "pet", position)?;
    show_window(&app, "pet")?;
    hide_window_if_present(&app, "main")
}

#[tauri::command]
pub fn switch_to_keyboard_mode(
    app: tauri::AppHandle,
    position: Option<EntryWindowPosition>,
) -> Result<(), String> {
    set_position_if_present(&app, "main", position)?;
    show_window(&app, "main")?;
    hide_window_if_present(&app, "pet")
}

fn toggle_window(app: tauri::AppHandle, label: &str) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(label) {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_search_window(app: tauri::AppHandle) -> Result<(), String> {
    toggle_window(app, "search")
}

#[tauri::command]
pub fn show_search_window(app: tauri::AppHandle) -> Result<(), String> {
    show_window(&app, "search")
}

#[tauri::command]
pub fn toggle_pet_window(app: tauri::AppHandle) -> Result<(), String> {
    toggle_window(app, "pet")
}
```

- [ ] **Step 2: Register commands**

In `app/src-tauri/src/lib.rs`, add the new commands near existing `entries::*` handlers:

```rust
entries::show_pet_window,
entries::show_keyboard_window,
entries::switch_to_pet_mode,
entries::switch_to_keyboard_mode,
```

- [ ] **Step 3: Verify Rust**

Run: `cargo fmt --check`

Expected: PASS after running `cargo fmt` if formatting is needed.

Run: `cargo check`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/entries.rs app/src-tauri/src/lib.rs
git commit -m "feat: add entry mode window commands"
```

---

### Task 3: Replace Keyboard Logo With Pixel-Cat Switch Button

**Files:**
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Add keyboard transition state and pixel-cat button**

In `app/src/App.tsx`, add state near existing tab state:

```ts
const [modeTransition, setModeTransition] = useState<"idle" | "to-pet">("idle");
```

Add helper functions inside `App`:

```ts
async function saveCurrentWindowPosition(mode: "main" | "pet") {
  const position = await getCurrentWindow().outerPosition();
  setStoredEntryPosition(mode, { x: position.x, y: position.y });
  return position;
}

async function switchToPetMode() {
  if (modeTransition !== "idle") return;
  setModeTransition("to-pet");
  const position = await saveCurrentWindowPosition("main");
  const petPosition = getStoredEntryPosition("pet") ?? {
    x: position.x + 640,
    y: position.y + 80,
  };
  window.setTimeout(() => {
    invoke("switch_to_pet_mode", { position: petPosition }).finally(() => {
      setModeTransition("idle");
    });
  }, 180);
}
```

Import the utility:

```ts
import { getStoredEntryPosition, setStoredEntryPosition } from "@/entry/windowPosition";
```

- [ ] **Step 2: Replace the current left logo image with a button**

Replace the title-bar left logo block with:

```tsx
<button
  onClick={() => switchToPetMode().catch(console.error)}
  title="切换到像素猫入口"
  style={{
    width: 26,
    height: 26,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 7,
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.86)",
    cursor: "pointer",
    padding: 0,
    display: "grid",
    placeItems: "center",
  }}
  type="button"
>
  <span style={{ fontSize: 16, lineHeight: 1 }}>▟</span>
</button>
<span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)", letterSpacing: "0.3px" }}>
  DevLauncher
</span>
```

The glyph is intentionally temporary and ASCII-safe. If the repo later accepts an image asset, replace it with a pixel-cat bitmap or SVG asset in a separate task.

- [ ] **Step 3: Apply exit animation to the keyboard panel**

On the `.glass` panel style, add:

```ts
transform: modeTransition === "to-pet" ? "scale(0.92) translateY(8px)" : "scale(1)",
opacity: modeTransition === "to-pet" ? 0 : 1,
transition: "transform 180ms ease, opacity 180ms ease",
```

- [ ] **Step 4: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/App.tsx
git commit -m "feat: switch keyboard to pixel pet"
```

---

### Task 4: Add Pet Dragging, Keyboard Switch, and Smooth Return

**Files:**
- Modify: `app/src/entry/PetEntryApp.tsx`
- Modify: `app/src-tauri/capabilities/default.json`

- [ ] **Step 1: Add pet position restore and drag**

In `app/src/entry/PetEntryApp.tsx`, import:

```ts
import { getStoredEntryPosition, setStoredEntryPosition } from "./windowPosition";
```

Also import Tauri position helpers:

```ts
import { PhysicalPosition } from "@tauri-apps/api/dpi";
```

Add mount restore:

```ts
useEffect(() => {
  const saved = getStoredEntryPosition("pet");
  if (!saved) return;
  getCurrentWindow().setPosition(new PhysicalPosition(saved.x, saved.y)).catch(console.error);
}, []);
```

Add drag handler:

```ts
async function dragPet() {
  const win = getCurrentWindow();
  await win.startDragging();
  window.setTimeout(async () => {
    const position = await win.outerPosition();
    setStoredEntryPosition("pet", { x: position.x, y: position.y });
  }, 120);
}
```

- [ ] **Step 2: Add keyboard ring item**

Change `menuItems` to include keyboard:

```ts
const menuItems = [
  { label: "键盘", title: "切换到键盘", x: 0, y: -76, action: "keyboard" },
  { label: "搜索", title: "打开搜索", x: 72, y: -22, action: "search" },
  { label: "报告", title: "打开截图报告", x: 44, y: 64, action: "report" },
  { label: "剪贴", title: "打开剪贴板", x: -44, y: 64, action: "clip" },
  { label: "隐藏", title: "隐藏宠物", x: -72, y: -22, action: "hide" },
] as const;
```

- [ ] **Step 3: Add switch back to keyboard mode**

Add:

```ts
async function switchToKeyboard() {
  const position = await getCurrentWindow().outerPosition();
  setStoredEntryPosition("pet", { x: position.x, y: position.y });
  const keyboardPosition = getStoredEntryPosition("main") ?? {
    x: Math.max(0, position.x - 640),
    y: Math.max(0, position.y - 80),
  };
  await invoke("switch_to_keyboard_mode", { position: keyboardPosition });
}
```

Update `runAction`:

```ts
if (action === "keyboard") await switchToKeyboard();
if (action === "search") await openSearch();
if (action === "report") await openScreenshotReport();
if (action === "clip") await openClipboard();
if (action === "hide") await hidePet();
```

- [ ] **Step 4: Wire dragging without breaking menu click**

On the center pet button, add:

```tsx
onPointerDown={(event) => {
  if (event.button !== 0 || open) return;
  dragPet().catch(console.error);
}}
```

Keep `onClick` for menu open/close. If dragging causes unwanted click toggles in manual verification, add a `draggingRef` guard that ignores the next click after drag.

- [ ] **Step 5: Ensure permissions**

In `app/src-tauri/capabilities/default.json`, ensure these permissions exist:

```json
"core:window:allow-start-dragging",
"core:window:allow-set-position",
"core:window:allow-outer-position"
```

- [ ] **Step 6: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/entry/PetEntryApp.tsx app/src-tauri/capabilities/default.json
git commit -m "feat: make pixel pet draggable"
```

---

### Task 5: Fix Show vs Toggle Actions and Shortcut Semantics

**Files:**
- Modify: `app/src-tauri/src/builtins/clipboard.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src/App.tsx`
- Modify: `app/src/entry/PetEntryApp.tsx`

- [ ] **Step 1: Add explicit clipboard show command**

In `app/src-tauri/src/builtins/clipboard.rs`, add:

```rust
#[tauri::command]
pub fn show_clipboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("clipboard") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

In `app/src-tauri/src/lib.rs`, register:

```rust
builtins::clipboard::show_clipboard_window,
```

- [ ] **Step 2: Use show semantics in pet actions**

In `app/src/entry/PetEntryApp.tsx`, update:

```ts
async function openScreenshotReport() {
  await invoke("show_screenshotai_window");
}

async function openClipboard() {
  await invoke("show_clipboard_window");
}
```

- [ ] **Step 3: Make `Alt+Space` keyboard-mode-aware**

In `app/src/App.tsx`, replace the `Alt+Space` handler body with:

```ts
const win = getCurrentWindow();
if (await win.isVisible()) {
  const position = await win.outerPosition();
  setStoredEntryPosition("main", { x: position.x, y: position.y });
  win.hide().catch(() => {});
} else {
  const position = getStoredEntryPosition("main");
  await invoke("show_keyboard_window", { position });
}
```

This prevents `Alt+Space` from using stale window coordinates and makes reopening the keyboard explicit.

- [ ] **Step 4: Keep `Ctrl+Shift+P` pet-mode-aware**

In `app/src/App.tsx`, replace the `Ctrl+Shift+P` callback with:

```ts
const position = getStoredEntryPosition("pet");
invoke("show_pet_window", { position }).catch(console.error);
```

This removes accidental toggle-close behavior from the pet shortcut.

- [ ] **Step 5: Verify commands**

Run: `npm run build`

Expected: PASS.

Run: `cargo fmt --check`

Expected: PASS after formatting if needed.

Run: `cargo check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src-tauri/src/builtins/clipboard.rs app/src-tauri/src/lib.rs app/src/App.tsx app/src/entry/PetEntryApp.tsx
git commit -m "fix: make entry show and close logic explicit"
```

---

### Task 6: Runtime Verification Checklist

**Files:**
- No code changes unless a verification failure is found.

- [ ] **Step 1: Start app**

Run: `npm run tauri dev`

Expected: app compiles and launches.

- [ ] **Step 2: Verify keyboard to pet switch**

Manual check:
- Open virtual keyboard.
- Click the pixel-cat icon at the upper-left.
- Expected: keyboard fades/scales out; pet appears near the expected persisted pet coordinate; keyboard is hidden.

- [ ] **Step 3: Verify pet to keyboard switch**

Manual check:
- Open pet ring menu.
- Click `键盘`.
- Expected: pet hides; keyboard appears at its persisted coordinate; no search/report/clipboard windows open.

- [ ] **Step 4: Verify pet dragging**

Manual check:
- Drag the pet to a new screen location.
- Hide pet.
- Reopen pet with `Ctrl+Shift+P`.
- Expected: pet reopens at the dragged location.

- [ ] **Step 5: Verify show/close logic**

Manual check:
- Click `搜索`, `报告`, `剪贴` from the pet ring while each target window is already open.
- Expected: the target window remains open/focused instead of closing.
- Press `Alt+Space` twice.
- Expected: first press opens/focuses keyboard, second press hides keyboard.
- Press `Ctrl+Shift+P` multiple times.
- Expected: pet opens/focuses and does not unexpectedly disappear from repeated show calls.

- [ ] **Step 6: Run final automated checks**

Run:

```bash
npm run test
npm run build
cargo fmt --check
cargo check
```

Expected: all pass.

- [ ] **Step 7: Commit verification fixes only if needed**

If manual verification exposes a bug, commit the minimal fix:

```bash
git add <changed files>
git commit -m "fix: stabilize entry mode switching"
```

---

## Self-Review

- Spec coverage: covers keyboard-to-pet switching, pet-to-keyboard switching, pixel-cat switch affordance, smooth transition simulation, draggable pet position persistence, keyboard/pet coordinate persistence, and show/close logic cleanup.
- Red-flag scan: no unfinished marker strings remain.
- Type consistency: `EntryWindowMode`, `EntryWindowPosition`, `getStoredEntryPosition`, `setStoredEntryPosition`, `switch_to_pet_mode`, and `switch_to_keyboard_mode` are introduced before later tasks reference them.
- Scope boundary: this plan keeps the two-window architecture and does not rebuild all entry modes into a single window manager.
