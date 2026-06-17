# Compact Pet Hit Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop pet occupy much less clickable screen area by shrinking the pet window, replacing the five-button top menu with four corner buttons, removing the custom action entry, and keeping click behavior stable.

**Architecture:** Put pet sizing and menu geometry behind exported constants and pure helpers so the layout can be tested without rendering the Tauri window. Implement the stable part first: tighter Tauri/window sizes, smaller sprite visuals, four corner action buttons, and Web-layer pointer-event containment. Treat native click-through as an optional macOS capability check and do not enable whole-window mouse ignoring if it would make the pet unclickable.

**Tech Stack:** React 19, TypeScript, Vitest, GSAP, Tauri 2, Rust/macOS window APIs where safe.

---

## Scope Check

The spec covers one feature area: the `pet` entry window. It includes front-end layout and a small native capability assessment for click-through behavior. These belong in one plan because the user-facing goal is reducing the actual blocked desktop area while keeping the pet usable.

## File Structure

- Create: `app/src/entry/petLayout.ts`
  - Owns window sizes, pet visual sizes, menu actions, menu coordinates, and small pure geometry helpers.
- Create: `app/src/entry/petLayout.test.ts`
  - Tests the default/open sizes, menu action count, removed custom action, corner button bounds, and area reduction.
- Modify: `app/src/entry/PetEntryApp.tsx`
  - Uses the layout constants, removes custom action UI/state, switches to four corner menu buttons, and keeps sprite animation frame-only.
- Modify: `app/src/index.css`
  - Updates pet sprite sizes and menu button styling for compact corner buttons.
- Modify: `app/src-tauri/tauri.conf.json`
  - Changes the initial `pet` window size from `284 x 284` to `152 x 136`.
- Optionally modify: `app/src-tauri/src/entries.rs`
  - Only if a safe native click-through capability can be added without breaking pet clicks. Do not enable whole-window click-through by default.

## Task 1: Extract Pet Layout Constants And Tests

**Files:**
- Create: `app/src/entry/petLayout.ts`
- Create: `app/src/entry/petLayout.test.ts`

- [ ] **Step 1: Write failing layout tests**

Create `app/src/entry/petLayout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CURRENT_PET_WINDOW_SIZE,
  PET_BUTTON_SIZE,
  PET_CLOSED_WINDOW_SIZE,
  PET_IMAGE_WIDTH,
  PET_KEYBOARD_IMAGE_WIDTH,
  PET_MENU_BUTTON_SIZE,
  PET_MENU_ITEMS,
  PET_OPEN_WINDOW_SIZE,
  getCenteredResizeOffset,
  getPetWindowArea,
} from "./petLayout";

describe("pet compact layout", () => {
  it("uses a compact default window and compact expanded window", () => {
    expect(PET_CLOSED_WINDOW_SIZE).toEqual({ width: 152, height: 136 });
    expect(PET_OPEN_WINDOW_SIZE).toEqual({ width: 172, height: 152 });
    expect(getPetWindowArea(PET_CLOSED_WINDOW_SIZE)).toBe(20672);
    expect(getPetWindowArea(PET_OPEN_WINDOW_SIZE)).toBe(26144);
    expect(getPetWindowArea(PET_OPEN_WINDOW_SIZE)).toBeLessThan(getPetWindowArea(CURRENT_PET_WINDOW_SIZE));
  });

  it("shrinks pet visual sizes", () => {
    expect(PET_BUTTON_SIZE).toEqual({ width: 116, height: 102 });
    expect(PET_IMAGE_WIDTH).toBe(132);
    expect(PET_KEYBOARD_IMAGE_WIDTH).toBe(148);
  });

  it("keeps four corner menu actions and removes custom action", () => {
    expect(PET_MENU_ITEMS.map((item) => item.action)).toEqual([
      "search",
      "report",
      "clip",
      "keyboard",
    ]);
    expect(PET_MENU_ITEMS).toHaveLength(4);
    expect(PET_MENU_ITEMS.some((item) => item.action === "custom-action")).toBe(false);
  });

  it("places menu buttons near the four pet corners", () => {
    expect(PET_MENU_BUTTON_SIZE).toEqual({ width: 34, height: 30 });
    expect(PET_MENU_ITEMS.map((item) => [item.action, item.left, item.top])).toEqual([
      ["search", 33, 29],
      ["report", 139, 29],
      ["clip", 33, 123],
      ["keyboard", 139, 123],
    ]);
  });

  it("keeps the pet centered while resizing the window", () => {
    expect(getCenteredResizeOffset(PET_CLOSED_WINDOW_SIZE, PET_OPEN_WINDOW_SIZE)).toEqual({
      x: -10,
      y: -8,
    });
    expect(getCenteredResizeOffset(PET_OPEN_WINDOW_SIZE, PET_CLOSED_WINDOW_SIZE)).toEqual({
      x: 10,
      y: 8,
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
cd app
npm test -- petLayout
```

Expected: FAIL because `app/src/entry/petLayout.ts` does not exist.

- [ ] **Step 3: Create `petLayout.ts`**

Create `app/src/entry/petLayout.ts`:

```ts
export type PetWindowSize = {
  width: number;
  height: number;
};

export type PetAction = "search" | "report" | "clip" | "keyboard";

export type PetMenuItem = {
  label: string;
  title: string;
  left: number;
  top: number;
  action: PetAction;
};

export const CURRENT_PET_WINDOW_SIZE: PetWindowSize = { width: 284, height: 284 };
export const PET_CLOSED_WINDOW_SIZE: PetWindowSize = { width: 152, height: 136 };
export const PET_OPEN_WINDOW_SIZE: PetWindowSize = { width: 172, height: 152 };
export const PET_BUTTON_SIZE: PetWindowSize = { width: 116, height: 102 };
export const PET_MENU_BUTTON_SIZE: PetWindowSize = { width: 34, height: 30 };
export const PET_IMAGE_WIDTH = 132;
export const PET_KEYBOARD_IMAGE_WIDTH = 148;
export const PET_MENU_CLOSE_DELAY_MS = 180;

export const PET_MENU_ITEMS: PetMenuItem[] = [
  { label: "搜索", title: "打开搜索", left: 33, top: 29, action: "search" },
  { label: "报告", title: "打开截图报告", left: 139, top: 29, action: "report" },
  { label: "剪贴", title: "打开剪贴板", left: 33, top: 123, action: "clip" },
  { label: "键盘", title: "切换到键盘模式", left: 139, top: 123, action: "keyboard" },
];

export function getPetWindowArea(size: PetWindowSize): number {
  return size.width * size.height;
}

export function getCenteredResizeOffset(from: PetWindowSize, to: PetWindowSize): { x: number; y: number } {
  return {
    x: Math.round((from.width - to.width) / 2),
    y: Math.round((from.height - to.height) / 2),
  };
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
cd app
npm test -- petLayout
```

Expected: PASS.

Commit:

```bash
git add app/src/entry/petLayout.ts app/src/entry/petLayout.test.ts
git commit -m "test: define compact pet layout"
```

## Task 2: Apply Compact Window And Four-Corner Menu

**Files:**
- Modify: `app/src/entry/PetEntryApp.tsx`
- Modify: `app/src/index.css`
- Modify: `app/src-tauri/tauri.conf.json`
- Test: `app/src/entry/petLayout.test.ts`

- [ ] **Step 1: Import layout constants and remove custom action state**

In `app/src/entry/PetEntryApp.tsx`, replace the current sizing constants and menu declarations:

```ts
import {
  PET_BUTTON_SIZE,
  PET_CLOSED_WINDOW_SIZE,
  PET_IMAGE_WIDTH,
  PET_KEYBOARD_IMAGE_WIDTH,
  PET_MENU_BUTTON_SIZE,
  PET_MENU_CLOSE_DELAY_MS,
  PET_MENU_ITEMS,
  PET_OPEN_WINDOW_SIZE,
  getCenteredResizeOffset,
  type PetAction,
} from "./petLayout";
```

Remove these constants and values:

```ts
const PET_ACTION_UPLOAD_SLOT = "devlauncher:pet-custom-action-upload";
const PET_CLOSED_WINDOW_SIZE = { width: 284, height: 284 };
const PET_OPEN_WINDOW_SIZE = { width: 284, height: 284 };
const PET_OPEN_WINDOW_OFFSET = {
  x: 0,
  y: 0,
};
const PET_WIDTH = 148;
const PET_HEIGHT = 132;
const PET_MENU_CLOSE_DELAY_MS = 220;
const customActionUploadEntry = {
  storageKey: PET_ACTION_UPLOAD_SLOT,
  accepts: ["image/png", "image/webp"],
  frameSource: "future-upload",
} as const;
```

Remove these refs/state:

```ts
const [customHintVisible, setCustomHintVisible] = useState(false);
const customHintTimerRef = useRef<number | null>(null);
```

Remove the `showCustomActionHint` function and cleanup line:

```ts
if (customHintTimerRef.current !== null) window.clearTimeout(customHintTimerRef.current);
```

- [ ] **Step 2: Update pet button and menu styles**

In `centerButtonStyle`, use the extracted compact size:

```ts
const centerButtonStyle: CSSProperties = {
  position: "relative",
  zIndex: 3,
  width: PET_BUTTON_SIZE.width,
  height: PET_BUTTON_SIZE.height,
  border: 0,
  background: "transparent",
  boxShadow: "none",
  cursor: "grab",
  display: "grid",
  placeItems: "center",
  padding: 0,
  userSelect: "none",
  transition: "filter 180ms ease",
  touchAction: "none",
  pointerEvents: "auto",
};
```

Replace `bubbleMenuStyle` with a compact transparent overlay:

```ts
const bubbleMenuStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  zIndex: 5,
  width: PET_OPEN_WINDOW_SIZE.width,
  height: PET_OPEN_WINDOW_SIZE.height,
  opacity: 0,
  transform: "scale(0.94)",
  transformOrigin: "center",
  pointerEvents: "none",
  overflow: "visible",
};
```

Replace `actionButtonStyle` with:

```ts
const actionButtonStyle: CSSProperties = {
  position: "absolute",
  zIndex: 6,
  width: PET_MENU_BUTTON_SIZE.width,
  height: PET_MENU_BUTTON_SIZE.height,
  borderRadius: 6,
  border: "2px solid rgba(226,232,240,0.68)",
  background: "rgba(30, 41, 59, 0.98)",
  color: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
  padding: 0,
  outline: "none",
  display: "grid",
  placeItems: "center",
  boxShadow: "0 3px 0 rgba(0,0,0,0.35)",
  transform: "translate(-50%, -50%) scale(0.72)",
  opacity: 0,
  transition: "background 120ms ease, box-shadow 160ms ease, filter 160ms ease",
  pointerEvents: "auto",
};
```

- [ ] **Step 3: Update window resizing to keep the pet centered**

Replace `setPetWindowLayout` with:

```ts
async function setPetWindowLayout(open: boolean) {
  const win = getCurrentWindow();
  const position = await win.outerPosition();
  const fromSize = open ? PET_CLOSED_WINDOW_SIZE : PET_OPEN_WINDOW_SIZE;
  const toSize = open ? PET_OPEN_WINDOW_SIZE : PET_CLOSED_WINDOW_SIZE;
  const offset = getCenteredResizeOffset(fromSize, toSize);

  await win.setSize(new LogicalSize(toSize.width, toSize.height));
  await win.setPosition(new PhysicalPosition(position.x + offset.x, position.y + offset.y));
}
```

Keep `setPetWindowSize(false)` for initial load.

- [ ] **Step 4: Switch menu mapping to four actions**

Replace every `menuItems` reference in `PetEntryApp.tsx` with `PET_MENU_ITEMS`.

Update the `PetActionIcon` fallback so every action is explicit:

```tsx
function PetActionIcon({ action }: { action: PetAction }) {
  const iconProps = { size: 19, decorative: true };
  if (action === "search") return <SearchIcon {...iconProps} />;
  if (action === "report") return <ReportIcon {...iconProps} />;
  if (action === "clip") return <ClipIcon {...iconProps} />;
  return <KeyboardIcon {...iconProps} />;
}
```

Update `runAction` to remove the custom action branch:

```ts
async function runAction(action: PetAction) {
  closePetMenu();
  if (action === "search") await openSearch();
  if (action === "report") await openScreenshotReport();
  if (action === "clip") await openClipboard();
  if (action === "keyboard") await switchToKeyboard();
}
```

Remove the hint JSX:

```tsx
<div className={`pet-custom-action-hint ${customHintVisible ? "is-visible" : ""}`} role="status">
  已预留上传动作图片入口
</div>
```

- [ ] **Step 5: Add hit-area containment at the Web layer**

Update `shellStyle`:

```ts
const shellStyle: CSSProperties = {
  position: "relative",
  width: "100vw",
  height: "100vh",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  color: "rgba(255,255,255,0.92)",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  overflow: "visible",
  pointerEvents: "none",
};
```

The pet center button and menu action buttons keep `pointerEvents: "auto"` from earlier steps. This does not create native OS pass-through by itself, but it prevents invisible DOM elements from expanding the Web hit target inside the already-smaller window.

- [ ] **Step 6: Update the Tauri pet window initial size**

In `app/src-tauri/tauri.conf.json`, update the `pet` window:

```json
{
  "label": "pet",
  "url": "index.html?entry=pet",
  "title": "DevLauncher Pet",
  "width": 152,
  "height": 136,
  "resizable": false,
  "decorations": false,
  "transparent": true,
  "shadow": false,
  "alwaysOnTop": true,
  "visibleOnAllWorkspaces": true,
  "center": false,
  "skipTaskbar": true,
  "visible": false
}
```

Only change `width` and `height`; preserve the other fields exactly.

- [ ] **Step 7: Update CSS sprite sizing and remove custom hint CSS**

In `app/src/index.css`, change `.pet-siamese-frame`:

```css
.pet-siamese-frame {
  position: relative;
  width: 116px;
  height: 102px;
  display: block;
  overflow: visible;
  image-rendering: pixelated;
  pointer-events: none;
}
```

Change `.pet-siamese-frame img`:

```css
.pet-siamese-frame img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 132px;
  height: auto;
  transform: translate(-50%, -51%);
  image-rendering: pixelated;
  user-select: none;
  -webkit-user-drag: none;
}
```

Change keyboard action image:

```css
.pet-siamese-frame[data-pet-sprite-action="keyboardJump"] img {
  width: 148px;
  transform: translate(-50%, -52%);
}
```

Delete the `.pet-custom-action-hint` and `.pet-custom-action-hint.is-visible` blocks. Keep `.pet-action-plus` only if another component still uses it; if `rg "pet-action-plus" app/src` finds no usage, delete that CSS block too.

- [ ] **Step 8: Run tests and commit**

Run:

```bash
cd app
npm test -- petLayout
npm run build
```

Expected: PASS.

Commit:

```bash
git add app/src/entry/petLayout.ts app/src/entry/petLayout.test.ts app/src/entry/PetEntryApp.tsx app/src/index.css app/src-tauri/tauri.conf.json
git commit -m "feat: compact desktop pet menu"
```

## Task 3: Assess Native Click-Through Safely

**Files:**
- Modify only if safe: `app/src-tauri/src/entries.rs`
- Modify only if safe: `app/src-tauri/src/lib.rs`
- Create only if safe: `app/src-tauri/src/entries_clickthrough_tests.rs` is not needed; keep tests inside `entries.rs` if simple.

- [ ] **Step 1: Check whether Tauri exposes whole-window cursor ignoring**

Run:

```bash
cd app/src-tauri
rg -n "ignore_cursor|set_ignore|cursor_events|mouse_events" ~/.cargo/registry/src app/src-tauri/src
```

Expected: either find a Tauri API such as `set_ignore_cursor_events` or confirm no direct API exists locally.

- [ ] **Step 2: If the only available API ignores the entire window, do not enable it by default**

If the available API is whole-window only, record this in the implementation notes and do not wire it into pet default behavior:

```text
Native click-through assessment:
- Whole-window mouse ignoring would make the pet itself unclickable.
- The compact 152x136 / 172x152 window and Web pointer-events containment remain the shipped baseline.
```

Do not commit code for a whole-window click-through toggle unless it is hidden behind a command that is never called by default.

- [ ] **Step 3: If a safe per-window command is still useful, add a disabled-by-default command**

Only if `WebviewWindow` supports whole-window cursor ignoring and the project compiles with the current Tauri API, add this command to `app/src-tauri/src/entries.rs`:

```rust
#[tauri::command]
pub fn set_pet_window_ignore_cursor_events(
    app: tauri::AppHandle,
    ignore: bool,
) -> Result<(), String> {
    let win = app
        .get_webview_window("pet")
        .ok_or_else(|| "window not found: pet".to_string())?;
    win.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
}
```

Register it in `app/src-tauri/src/lib.rs`:

```rust
entries::set_pet_window_ignore_cursor_events,
```

Do not call this command from `PetEntryApp.tsx` in this task. It exists only for future explicit experiments because default use would break pet clicks.

- [ ] **Step 4: Verify Rust state**

Run:

```bash
cd app/src-tauri
cargo test quickmemory
```

Expected in the current local environment: this may FAIL before compiling project tests with the known rustc version issue:

```text
rustc 1.87.0 is not supported
requires rustc 1.88.0
```

If it fails for that reason, record the exact toolchain blocker in the final result. If it fails for code errors in `entries.rs`, fix the code or remove the optional command.

- [ ] **Step 5: Commit only safe native changes**

If no native code was added, skip this commit.

If the disabled-by-default command was added and builds in an environment with compatible Rust:

```bash
git add app/src-tauri/src/entries.rs app/src-tauri/src/lib.rs
git commit -m "feat: add pet cursor event toggle"
```

## Task 4: Manual QA And Final Polish

**Files:**
- Modify only files changed in Tasks 1-3 if QA finds a defect.

- [ ] **Step 1: Run full front-end tests**

Run:

```bash
cd app
npm test
```

Expected: PASS.

- [ ] **Step 2: Run front-end build**

Run:

```bash
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 3: Start the Tauri app**

Run:

```bash
cd app
npm run tauri:dev:mac
```

Expected: the app launches. If the command fails because the Rust toolchain is still `1.87.0` and dependencies require `1.88.0+`, record that as the blocker and run browser-level preview checks instead.

- [ ] **Step 4: Manual QA checklist**

In the running app:

- [ ] Default pet window is visibly smaller than before.
- [ ] Default pet remains easy to click.
- [ ] Default pet remains draggable and saves position.
- [ ] Clicking the pet opens the compact four-corner menu.
- [ ] The menu has exactly four buttons: search, report, clipboard, keyboard.
- [ ] No custom action/add button appears.
- [ ] Buttons slightly overlap the pet corners but do not cover the center of the pet.
- [ ] Search button opens the search window.
- [ ] Report button opens the screenshot report window.
- [ ] Clipboard button opens the clipboard window.
- [ ] Keyboard button switches to keyboard mode.
- [ ] Keyboard-related pet animation plays frames but does not move the pet around inside the window.
- [ ] Closing the menu restores the compact window without obvious position jump.
- [ ] Clicking near but outside the compact pet window no longer gets blocked by a large `284 x 284` transparent area.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --stat HEAD
git diff -- app/src/entry app/src/index.css app/src-tauri/tauri.conf.json app/src-tauri/src/entries.rs app/src-tauri/src/lib.rs
```

Expected: only pet compact layout, pet CSS, pet window config, and optional disabled native cursor command changes are present. Existing unrelated dirty files should remain unrelated and unstaged.

- [ ] **Step 6: Commit QA fixes if needed**

If QA required fixes:

```bash
git add app/src/entry app/src/index.css app/src-tauri/tauri.conf.json app/src-tauri/src/entries.rs app/src-tauri/src/lib.rs
git commit -m "fix: polish compact pet hit area"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: Task 1 covers testable constants and geometry. Task 2 covers smaller default/open windows, smaller pet visuals, removal of custom action UI/state, four corner buttons, and no sprite displacement. Task 3 covers the conservative native click-through assessment. Task 4 covers manual desktop blocking, drag, menu, and mode-switch validation.
- Completeness scan: The plan has concrete file paths, code snippets, exact commands, and expected outcomes. It does not require a vague future implementation step.
- Type consistency: `PetAction` is `"search" | "report" | "clip" | "keyboard"` everywhere. `PET_MENU_ITEMS` replaces the local `menuItems`; `PET_CLOSED_WINDOW_SIZE` and `PET_OPEN_WINDOW_SIZE` use the same `{ width, height }` shape expected by `LogicalSize`.
