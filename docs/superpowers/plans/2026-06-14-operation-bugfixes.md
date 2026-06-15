# Operation Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed interaction bugs from the operation audit so click, double-click, keyboard shortcuts, destructive actions, and window text behave predictably.

**Architecture:** Keep the existing Tauri + React structure. Make narrow UI and behavior fixes in the files that already own each interaction, add small reusable helpers only where they remove repeated confirmation logic, and verify with build/tests plus targeted source searches.

**Tech Stack:** Tauri 2, React 19, TypeScript, Zustand, Rust backend commands, PowerShell on Windows, npm, Vitest where existing tests are present.

---

## Scope

Fix these confirmed bugs:

- Build cannot run because dependencies are not installed in `app/node_modules`.
- Chinese UI text is mojibake in several current source files.
- Global shortcuts conflict with common Windows/input-method/editor shortcuts.
- Pet center button has conflicting single-click and double-click behavior.
- Terminal close behavior differs from other tool windows.
- Destructive operations often run without confirmation.
- Remote desktop connection sends mouse events but not keyboard events.

Do not add new product surfaces, redesign layouts, change feature registration, or refactor unrelated modules.

## File Structure

- Modify: `app/package.json`
  - Add a small shortcut configuration note only if implementation needs script changes; otherwise leave unchanged.
- Modify: `app/src/App.tsx`
  - Fix global shortcut choices and mojibake in main window text, title attributes, page labels, and tab menu labels.
- Modify: `app/src/components/KeyCell.tsx`
  - Fix mojibake tooltip text.
- Modify: `app/src/components/ClipboardPanel.tsx`
  - Fix mojibake and add clear confirmations.
- Modify: `app/src/components/BindingModal.tsx`
  - Add confirmations before clearing bindings and saved credentials.
- Modify: `app/src/components/SettingsPanel.tsx`
  - Add confirmations before removing web-account bindings and clearing passwords.
- Modify: `app/src/entry/PetEntryApp.tsx`
  - Remove the double-click conflict and fix mojibake labels/titles.
- Modify: `app/src/builtins/terminal/App.tsx`
  - Add `Escape` hide behavior while preserving `Ctrl+W`.
- Modify: `app/src/builtins/totp/App.tsx`
  - Add delete confirmation.
- Modify: `app/src/builtins/remotedesk/App.tsx`
  - Add delete confirmation, add keyboard forwarding on the remote canvas/window when connected, and document the forwarded event shape in code.
- Modify: `app/src/builtins/json/App.tsx`
  - Add history deletion confirmation.
- Modify: `app/src/builtins/screenshotai/App.tsx`
  - Add screenshot deletion confirmation if missing and keep clear-all confirmation.
- Modify: `app/src-tauri/src/lib.rs`
  - Fix tray menu mojibake.
- Modify: `app/src-tauri/tauri.conf.json`
  - Fix mojibake window titles.
- Test: existing `npm run build` and targeted `rg` searches.

## Shortcut Policy

Use lower-conflict defaults:

- Main keyboard toggle: keep `Alt+Space` only if manual confirmation shows it works; otherwise change to `Ctrl+Alt+Space`.
- Search entry: change `Ctrl+Space` to `Ctrl+Alt+K`.
- Pet entry: change `Ctrl+Shift+P` to `Ctrl+Alt+P`.
- Clipboard: keep `Ctrl+Shift+V` only if the user accepts editor/terminal conflict; otherwise change to `Ctrl+Alt+V`.

For this bugfix pass, implement the conservative default set:

```ts
const GLOBAL_SHORTCUTS = {
  keyboard: "Ctrl+Alt+Space",
  clipboard: "Ctrl+Alt+V",
  search: "Ctrl+Alt+K",
  pet: "Ctrl+Alt+P",
} as const;
```

This avoids common IME `Ctrl+Space`, VS Code `Ctrl+Shift+P`, and terminal/editor `Ctrl+Shift+V` conflicts.

---

### Task 1: Restore Local Dependencies and Establish Baseline

**Files:**
- Read: `app/package.json`
- Read: `app/package-lock.json`
- Test: `app/node_modules`

- [ ] **Step 1: Confirm dependency state**

Run:

```powershell
Test-Path app\node_modules\gsap
Test-Path app\node_modules\@xterm\xterm
Test-Path app\node_modules\vitest
```

Expected before fix: at least one `False`.

- [ ] **Step 2: Install locked dependencies**

Run:

```powershell
cd app
npm ci
```

Expected: packages install from `package-lock.json` and `node_modules` contains `gsap`, `@xterm/xterm`, and `vitest`.

- [ ] **Step 3: Run build to get real code failures**

Run:

```powershell
cd app
npm run build
```

Expected: either build passes or now reports real TypeScript errors instead of missing dependency errors.

- [ ] **Step 4: If TypeScript reports implicit `any`, fix only those compile errors**

In `app/src/builtins/terminal/App.tsx`, change:

```ts
term.onData((data) => {
```

to:

```ts
term.onData((data: string) => {
```

In `app/src/entry/PetEntryApp.tsx`, change GSAP index callback parameters:

```ts
x: (index) => menuItems[index]?.x ?? 0,
y: (index) => menuItems[index]?.y ?? 0,
```

to:

```ts
x: (index: number) => menuItems[index]?.x ?? 0,
y: (index: number) => menuItems[index]?.y ?? 0,
```

- [ ] **Step 5: Verify build**

Run:

```powershell
cd app
npm run build
```

Expected: `tsc` completes and Vite produces `dist`.

---

### Task 2: Fix Global Shortcut Conflicts

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Add a single shortcut constant near the top of `App.tsx`**

Add after the size constants:

```ts
const GLOBAL_SHORTCUTS = {
  keyboard: "Ctrl+Alt+Space",
  clipboard: "Ctrl+Alt+V",
  search: "Ctrl+Alt+K",
  pet: "Ctrl+Alt+P",
} as const;
```

- [ ] **Step 2: Replace hardcoded global shortcut registrations**

In `app/src/App.tsx`, replace:

```ts
"Alt+Space"
```

with:

```ts
GLOBAL_SHORTCUTS.keyboard
```

Replace:

```ts
"Ctrl+Shift+V"
```

with:

```ts
GLOBAL_SHORTCUTS.clipboard
```

Replace:

```ts
"Ctrl+Space"
```

with:

```ts
GLOBAL_SHORTCUTS.search
```

Replace:

```ts
"Ctrl+Shift+P"
```

with:

```ts
GLOBAL_SHORTCUTS.pet
```

- [ ] **Step 3: Update settings copy**

In `app/src/components/SettingsPanel.tsx`, replace the entry shortcut descriptions with:

```tsx
Shortcut: Ctrl+Alt+K. Searches keyboard bindings, built-ins, and recent actions.
```

and:

```tsx
Shortcut: Ctrl+Alt+P. Opens quick actions for search, screenshot report, clipboard, keyboard mode, and hide. Drag to reposition; the pet position is saved.
```

- [ ] **Step 4: Update clipboard footer copy after mojibake repair**

In `app/src/components/ClipboardPanel.tsx`, use:

```tsx
点击复制 · Esc 关闭 · Ctrl+Alt+V 唤起
```

- [ ] **Step 5: Verify no old shortcut strings remain in live UI registration**

Run:

```powershell
rg -n '"Alt\+Space"|"Ctrl\+Space"|"Ctrl\+Shift\+P"|"Ctrl\+Shift\+V"' app/src
```

Expected: old strings do not remain in `registerShortcut(...)` calls. Any remaining matches are historical content in Quick Memory, not DevLauncher global shortcuts.

---

### Task 3: Fix Mojibake UI Text

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/KeyCell.tsx`
- Modify: `app/src/components/ClipboardPanel.tsx`
- Modify: `app/src/entry/PetEntryApp.tsx`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/tauri.conf.json`
- Optional targeted fixes: `app/src/types/actions.ts` if rendered labels still show mojibake.

- [ ] **Step 1: Replace main-window mojibake in `App.tsx`**

Use these exact replacement strings where the existing UI text is garbled:

```tsx
title="设置"
closeTitle="隐藏到托盘"
minimizeTitle="最小化"
const name = `页面 ${config.pages.length + 1}`;
title="新增页面"
label: "重命名"
label: "删除此页"
加载中...
加载配置失败
DevLauncher 主界面需要在 Tauri 桌面窗口中运行，直接打开 localhost 只能看到前端壳。
暂无配置
暂无页面配置
请编辑 keyboard.yaml 添加页面
```

- [ ] **Step 2: Replace key tooltip mojibake in `KeyCell.tsx`**

For bound keys:

```ts
const tooltipText = `${action.name}\n[快捷键 ${keyId}] 左键执行 / 右键编辑`;
```

For empty keys:

```tsx
<Tooltip text={`点击绑定 [${keyId}]`} visible={hovered} />
```

- [ ] **Step 3: Replace clipboard panel mojibake**

Use these visible labels in `app/src/components/ClipboardPanel.tsx`:

```tsx
剪贴板
{textCount} 文 {imageCount} 图
{favorites.length} 项
历史
★ 收藏
搜索文字...
搜索收藏...
暂无剪贴板历史
暂无收藏
在历史记录中点击 ★ 收藏项目
取消收藏
加入收藏
点击复制文字
点击复制图片
复制
✓
图片
清空历史
清空收藏
```

- [ ] **Step 4: Replace pet entry mojibake**

In `app/src/entry/PetEntryApp.tsx`, use:

```ts
const menuItems = [
  { label: "搜索", title: "打开搜索", x: 0, y: -92, action: "search" },
  { label: "报告", title: "打开截图报告", x: 92, y: 0, action: "report" },
  { label: "剪贴", title: "打开剪贴板", x: 0, y: 92, action: "clip" },
  { label: "键盘", title: "切换到键盘模式", x: -92, y: 0, action: "keyboard" },
] as const;
```

Set center button labels:

```tsx
aria-label="像素宠物入口"
title={open ? "收起菜单" : "展开快捷入口"}
```

- [ ] **Step 5: Replace tray menu mojibake**

In `app/src-tauri/src/lib.rs`, use:

```rust
let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
```

- [ ] **Step 6: Replace window title mojibake**

In `app/src-tauri/tauri.conf.json`, use:

```json
"title": "DevLauncher 远程桌面"
```

```json
"title": "DevLauncher 终端"
```

```json
"title": "DevLauncher 快捷记忆"
```

- [ ] **Step 7: Verify mojibake scan**

Run:

```powershell
rg -n "鈫|鈥|鈹|鍓|鏄|璁|閫|蹇|杩|缁|鐐|鏆|椤|鏂|馃|脳" app/src app/src-tauri/src app/src-tauri/tauri.conf.json
```

Expected: no matches in visible UI text touched by this bugfix. If comments still match but are not rendered, leave them unless they hurt maintainability.

---

### Task 4: Resolve Pet Single-Click and Double-Click Conflict

**Files:**
- Modify: `app/src/entry/PetEntryApp.tsx`

- [ ] **Step 1: Remove double-click open-search handler**

Change:

```tsx
onDoubleClick={() => openSearch().catch(console.error)}
```

to no prop at all.

- [ ] **Step 2: Add search to the explicit radial menu only**

Keep this existing behavior:

```tsx
if (action === "search") await openSearch();
```

Single-click now only opens/closes the menu; search requires clicking the search menu item.

- [ ] **Step 3: Verify double-click handler is gone**

Run:

```powershell
rg -n "onDoubleClick" app/src/entry/PetEntryApp.tsx
```

Expected: no matches.

---

### Task 5: Make Window Close Shortcuts Consistent

**Files:**
- Modify: `app/src/builtins/terminal/App.tsx`

- [ ] **Step 1: Add Escape to terminal hide shortcut**

Replace the terminal `keyHandler` body with:

```ts
const keyHandler = (e: KeyboardEvent) => {
  if (e.key === "Escape" || (e.ctrlKey && e.key.toLowerCase() === "w")) {
    e.preventDefault();
    getCurrentWindow().hide().catch(() => {});
  }
};
```

- [ ] **Step 2: Update terminal close title**

Use:

```tsx
closeTitle="关闭终端 (Esc / Ctrl+W)"
```

- [ ] **Step 3: Verify shortcut text**

Run:

```powershell
rg -n "Ctrl\+W|Escape|关闭终端" app/src/builtins/terminal/App.tsx
```

Expected: both `Escape` and `Ctrl+W` are represented.

---

### Task 6: Add Confirmations for Destructive Operations

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/ClipboardPanel.tsx`
- Modify: `app/src/components/BindingModal.tsx`
- Modify: `app/src/components/SettingsPanel.tsx`
- Modify: `app/src/builtins/json/App.tsx`
- Modify: `app/src/builtins/totp/App.tsx`
- Modify: `app/src/builtins/remotedesk/App.tsx`
- Modify: `app/src/builtins/screenshotai/App.tsx`

- [ ] **Step 1: Confirm page deletion**

In `app/src/App.tsx`, replace the delete page action with:

```ts
action: () => {
  const pageName = config.pages[tabMenu.index]?.name ?? "此页面";
  if (!window.confirm(`删除页面「${pageName}」？此操作会移除该页所有键位绑定。`)) return;
  removePage(tabMenu.index);
  persistConfig();
  setTabMenu(null);
},
danger: true,
```

- [ ] **Step 2: Confirm clipboard clear operations**

In `app/src/components/ClipboardPanel.tsx`, wrap footer clear buttons:

```tsx
onClick={() => {
  if (window.confirm("清空剪贴板历史？")) onClear();
}}
```

and:

```tsx
onClick={() => {
  if (window.confirm("清空全部收藏？")) onClearFavorites();
}}
```

- [ ] **Step 3: Confirm binding clear**

In `app/src/components/BindingModal.tsx`, at the start of the clear button handler add:

```ts
if (!window.confirm(`清除 ${keyId} 的绑定？已保存的相关密码也会删除。`)) return;
```

- [ ] **Step 4: Confirm credential-only deletion in binding modal**

For URL password clear:

```ts
if (!window.confirm("清除已保存的网页密码？")) return;
```

For SSH password clear:

```ts
if (!window.confirm("清除已保存的 SSH 密码？")) return;
```

- [ ] **Step 5: Confirm web-account setting actions**

In `app/src/components/SettingsPanel.tsx`, add to `clearPassword`:

```ts
if (!window.confirm(`清除「${entry.action.name}」保存的网页密码？`)) return;
```

Add to `removeBinding`:

```ts
if (!window.confirm(`移除网页账号绑定「${entry.action.name}」？`)) return;
```

- [ ] **Step 6: Confirm JSON history deletion**

In `app/src/builtins/json/App.tsx`, change the history delete button:

```tsx
<button
  style={BTN_STYLE}
  onClick={() => {
    if (!window.confirm("删除这条 JSON 历史？")) return;
    const next = history.filter((_, i) => i !== index);
    setHistory(next);
    saveHistory(next);
  }}
>
  删除
</button>
```

- [ ] **Step 7: Confirm TOTP deletion**

In `app/src/builtins/totp/App.tsx`, change `handleDelete` to:

```ts
const handleDelete = useCallback((id: string) => {
  const token = tokens.find(t => t.id === id);
  if (!window.confirm(`删除令牌「${token?.name ?? "未命名"}」？`)) return;
  const updated = tokens.filter(t => t.id !== id);
  persistTokens(updated);
}, [tokens, persistTokens]);
```

- [ ] **Step 8: Confirm RDP profile deletion**

In `app/src/builtins/remotedesk/App.tsx`, at the start of `handleDelete` add:

```ts
const profile = profiles.find(p => p.id === id);
if (!window.confirm(`删除远程桌面连接「${profile?.name || profile?.host || "未命名"}」？`)) return;
```

- [ ] **Step 9: Confirm screenshot deletion**

In `app/src/builtins/screenshotai/App.tsx`, at the start of `deleteItem` add:

```ts
if (!window.confirm("删除这张截图？")) return;
```

- [ ] **Step 10: Verify confirmation coverage**

Run:

```powershell
rg -n "window.confirm|confirm\\(" app/src/App.tsx app/src/components app/src/builtins
```

Expected: every destructive action listed above has a confirmation.

---

### Task 7: Add Remote Desktop Keyboard Forwarding

**Files:**
- Modify: `app/src/builtins/remotedesk/App.tsx`

- [ ] **Step 1: Add keyboard sender in `ConnectTab`**

Add this function near `sendMouse`:

```ts
function sendKey(e: KeyboardEvent, type: "keydown" | "keyup") {
  const ws = wsRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN || status !== "connected") return;
  if (document.body.dataset.remoteDeskFullscreen && e.key === "Escape") return;
  const target = e.target as HTMLElement | null;
  const isTyping = target && (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
  if (isTyping) return;
  e.preventDefault();
  ws.send(JSON.stringify({
    type,
    key: e.key,
    code: e.code,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
    repeat: e.repeat,
  }));
}
```

- [ ] **Step 2: Register connected keyboard listeners**

Add this effect inside `ConnectTab`:

```ts
useEffect(() => {
  if (status !== "connected") return;
  const onKeyDown = (event: KeyboardEvent) => sendKey(event, "keydown");
  const onKeyUp = (event: KeyboardEvent) => sendKey(event, "keyup");
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
  };
}, [status]);
```

- [ ] **Step 3: Add focus hint to connected canvas**

Set canvas focusability:

```tsx
tabIndex={0}
```

Keep:

```tsx
onContextMenu={e => e.preventDefault()}
```

- [ ] **Step 4: Verify frontend sends key events**

Run:

```powershell
rg -n "sendKey|keydown|keyup|type: \"keydown\"|type: \"keyup\"" app/src/builtins/remotedesk/App.tsx
```

Expected: `ConnectTab` has keyboard forwarding for both down and up events.

- [ ] **Step 5: Check backend compatibility**

Run:

```powershell
rg -n "\"keydown\"|\"keyup\"|mousedown|mouseup|mousemove|keyboard|key" app/src-tauri/src/builtins/remotedesk.rs
```

Expected: if backend has no keyboard handler, add a follow-up backend task before claiming remote keyboard works. If backend already handles generic JSON events, no backend change is needed.

---

### Task 8: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Build frontend**

Run:

```powershell
cd app
npm run build
```

Expected: success.

- [ ] **Step 2: Run frontend tests**

Run:

```powershell
cd app
npm test
```

Expected: existing tests pass. If tests fail because snapshots or old expectations reference shortcuts, update only those expectations.

- [ ] **Step 3: Check Rust**

Run:

```powershell
cd app\src-tauri
cargo check
```

Expected: success.

- [ ] **Step 4: Search for old shortcuts and mojibake**

Run:

```powershell
rg -n '"Alt\+Space"|"Ctrl\+Space"|"Ctrl\+Shift\+P"|"Ctrl\+Shift\+V"|鈫|鈥|鈹|鍓|鏄|璁|閫|蹇|杩|缁|鐐|鏆|椤|鏂|馃|脳' app/src app/src-tauri/src app/src-tauri/tauri.conf.json
```

Expected: no old shortcut strings in registration/copy and no mojibake in visible UI strings.

- [ ] **Step 5: Manual smoke test**

Run the Tauri app:

```powershell
cd app
npm run tauri dev
```

Manually verify:

- `Ctrl+Alt+Space` toggles keyboard.
- `Ctrl+Alt+K` opens search.
- `Ctrl+Alt+P` opens pet.
- `Ctrl+Alt+V` opens clipboard.
- Pet single-click opens/closes radial menu; double-click does not open search.
- Terminal hides with both `Esc` and `Ctrl+W`.
- Destructive operations show confirmation dialogs.
- Tray menu text is readable Chinese.
- Clipboard, main window, pet, and key tooltips show readable Chinese.
- Remote device connection forwards keyboard if backend supports it.

---

## Self-Review

- Spec coverage: all confirmed bugs from the operation audit are mapped to tasks.
- Placeholder scan: no TBD/TODO/fill-later placeholders remain.
- Type consistency: shortcut constants, `sendKey`, and confirmation logic use existing file-local types and APIs.
- Scope check: no new entry mode, plugin, visual redesign, or architecture rewrite is included.
