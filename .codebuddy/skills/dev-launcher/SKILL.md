---
name: dev-launcher
description: This skill provides comprehensive coding standards and guidelines for the DevLauncher project - a Tauri-based desktop launcher with React frontend. It should be used when working with DevLauncher codebase including adding new action types, modifying UI components, managing Zustand store, configuring global shortcuts, or working with Rust backend commands. The skill covers project architecture, component patterns, state management, theming system, and internationalization practices.
---

# DevLauncher Coding Standards

## Overview

This skill provides coding standards and guidelines for the DevLauncher project, a Tauri-based desktop launcher built with React frontend and Rust backend. It covers project architecture, component patterns, state management with Zustand, global shortcut handling, Rust command conventions, theme system, and internationalization practices.

## Project Architecture

```
dev-launcher/
├── app/                          # Tauri application root
│   ├── src/                      # React frontend
│   │   ├── main.tsx              # Entry point, no StrictMode
│   │   ├── App.tsx               # Main component: global shortcuts, Tab switching, modal control
│   │   ├── types/actions.ts      # ↔ All Action type definitions (single source of truth)
│   │   ├── store/useKeyboardStore.ts  # Zustand store (includes showClipboard)
│   │   ├── api/config.ts         # load/save config (Rust ↔ frontend format conversion)
│   │   ├── components/
│   │   │   ├── KeyCell.tsx       # Single key rendering (68px)
│   │   │   ├── KeyboardPanel.tsx # Keyboard layout (4 rows)
│   │   │   ├── ActionIcon.tsx    # Type icons (SVG)
│   │   │   ├── BindingModal.tsx  # Binding modal (all ActionType tabs)
│   │   │   └── ClipboardPanel.tsx # Built-in clipboard history panel
│   │   └── index.css             # glass styles, transparent background
│   └── src-tauri/
│       ├── src/lib.rs            # ★ Rust commands, tray, clipboard polling
│       ├── Cargo.toml            # Dependencies: tauri/dialog/global-shortcut/arboard
│       ├── tauri.conf.json       # Window: 860×480, transparent, decorations:false
│       └── capabilities/default.json  # Permission whitelist
```

## Adding New Action Types

To add a new action type, modify files in order:

### 1. `src/types/actions.ts`

✅ Extend union type
```typescript
export type ActionType = "app" | "folder" | ... | "your-new-type";

// ✅ Define interface (extend ActionBase)
export interface MyAction extends ActionBase {
  type: "your-new-type";
  // ...fields
}

// ✅ Add to Action union
export type Action = AppAction | ... | MyAction;

// ✅ Add to ACTION_TYPE_META (color required)
export const ACTION_TYPE_META: Record<ActionType, { label: string; color: string; bg: string }> = {
  // ...
  "your-new-type": { label: "Display Name", color: "#hex", bg: "rgba(...)" },
};
```

### 2. `src/components/ActionIcon.tsx`

- ✅ Add new SVG icon function `IconXxx()`
- ✅ Add to `TYPE_ICONS` mapping
- ✅ If special rendering needed, add `if (action.type === "xxx")` branch in ActionIcon component
- Note: system/builtin use centered SVG rendering; other types use letter avatars

### 3. `src/components/BindingModal.tsx`

- ✅ Add new type to `TABS` array
- ✅ Add corresponding fields in `useState`
- ✅ Add case in `handleSave` switch
- ✅ Add corresponding JSX in form area (conditional render `activeType === "xxx"`)

### 4. `src-tauri/src/lib.rs`

✅ Add new variant to Action enum (note serde field names match frontend)
```rust
MyType { name: String, field: String },

// ✅ Add match arm in execute_action
"mytype" => { /* execution logic */ }
```

## Adding New Builtin Features

Minimal modification path:

1. **`src/types/actions.ts`** - Add new value to `BuiltinFeature` union type, add metadata to `BUILTIN_FEATURES` record
2. **`src/components/BindingModal.tsx`** - builtin tab grid auto-renders (no changes needed)
3. **`src/App.tsx`** - Add `else if (b.feature === "xxx")` branch in `handleKeyClick` and global shortcut callback
4. **Create new `src/components/XxxPanel.tsx`** - Reference `ClipboardPanel.tsx` structure (overlay + panel + Esc to close)
5. **`src/store/useKeyboardStore.ts`** - If panel needs global state, add `showXxx + setShowXxx` (same pattern as showClipboard)

**Rust backend service (if needed):**
- Add new State struct + tauri::command in `lib.rs`
- Register state with `app.manage()` in `.setup()`, spawn background thread
- Register new command in `invoke_handler`

## Keyboard UI / Layout Modification

| File | Responsibility |
|------|---------------|
| `KeyCell.tsx` | Single key appearance (KEY_SIZE=68px, bound/unbound dual rendering) |
| `KeyboardPanel.tsx` | 4-row layout, stagger padding `[0,0,18,28]px`, gap 7px |
| `types/actions.ts` | `KEY_ROWS` defines key distribution (changes here affect globally) |

**Key constraints:**
- Window fixed at 860↔480, keyboard area must not exceed
- Use `ACTION_TYPE_META[type].bg` / `.color` for colors, do not hardcode
- Bound keys: colored background + letter avatar + type abbreviation top-right + key ID top-left

## Zustand Store Usage Rules

```typescript
// ✅ Inside React components - direct destructuring
const { config, setShowClipboard } = useKeyboardStore();

// ✅ Async callbacks / global shortcut callbacks / effect cleanup - use getState()
useKeyboardStore.getState().setShowClipboard(true);

// ✅ Effects needing latest values (avoid closure trap)
const state = useKeyboardStore.getState();
```

**Store fields:**
- `config: KeyboardConfig | null` - page + key configuration
- `activePageIndex: number` - currently active page
- `showClipboard: boolean` - clipboard panel toggle (must be in store for global shortcut callbacks)
- `addPage / renamePage / removePage` - page management (call `persistConfig()` after operations)
- `bindKey` - modify key bindings

## Global Shortcut Standards

**Shortcut format:** `Alt+KeyQ`, `Alt+Digit1` (converted by `keyIdToShortcut` function)

**Registration timing:** Re-register when `config` or `activePageIndex` changes

**Must prevent duplicate registration:**
```typescript
let cancelled = false;
const setup = async () => {
  await unregisterAll();
  if (cancelled) return;         // ←→ Must check
  for (const [...]) {
    if (cancelled) break;        // ←→ Also check inside loop
    // ...
  }
};
return () => { cancelled = true; unregisterAll().catch(()=>{}); };
```

**Builtin action callback writing (order matters):**
```typescript
// ① Set state first (synchronous)
useKeyboardStore.getState().setShowClipboard(true);
// ② Then operate window (fire-and-forget)
win.show().catch(() => {});
win.setFocus().catch(() => {});
```

## Rust Command Standards

```rust
// Command signature
#[tauri::command]
fn my_command(app: AppHandle, param: String) -> Result<ReturnType, String> {
    // Convert errors with map_err(|e| e.to_string())
}

// Registration (in invoke_handler)
tauri::generate_handler![..., my_command]

// Permissions (capabilities/default.json)
"core:default"  // Already includes basic permissions
// Plugin permission format: "{plugin}:allow-{action}"
```

**Current Rust commands:**
- `load_config` / `save_config` / `get_config_path`
- `execute_action` - execute all ActionTypes
- `get_clipboard_history` / `set_clipboard_text` / `clear_clipboard_history`

**State management (multi-thread sharing):**
```rust
pub struct MyState { pub data: Arc<Mutex<Vec<String>>> }
// In setup(): app.manage(MyState { data: Arc::clone(&data) });
// In commands: state: tauri::State<'_, MyState>
```

## Configuration File Format

**Path:** `C:\Users\{user}\AppData\Roaming\com.yisheng.app\keyboard.yaml`

**YAML structure (Rust serialization format, flat keys):**
```yaml
pages:
- name: ↔↔
  keys:
    Q:
      type: app
      name: VSCode
      target: "C:\\Program Files\\Microsoft VS Code\\Code.exe"
    B:
      type: builtin
      name: ↔↔
      feature: clipboard
```

**Frontend format (after loadConfig conversion):**
```typescript
{ pages: [{ name: "↔↔", keys: { Q: { action: { type: "app", ... } } } }] }
// keys have an additional { action: ... } wrapper
```

## Development Commands

```powershell
cd D:\goworkspace\src\aidk\dev-launcher\app
npm run tauri dev     # Start dev server (first compile ~2min, hot reload ~13s)
npx tsc --noEmit      # TypeScript type checking
```

**Rust recompilation triggers:** Modify any file under `src-tauri/` (including `Cargo.toml`, `lib.rs`, `tauri.conf.json`)

**Hot reload only (no recompilation):** Modify frontend files under `src/`

## Theme System Standards

### Architecture

- **CSS variables** (written to `document.documentElement` by `useEffect` in `App.tsx`):
  - `--theme-bg` ↔ `hexToRgba(bgColor, bgOpacity)`
  - `--theme-blur` ↔ `${blurRadius}px`
  - `--theme-border` ↔ `borderColor`
  - `--theme-bg-solid` ↔ `bgColor` (solid color, no transparency)
- **`.glass` CSS class** (`index.css`) consumes above variables, includes fallback defaults
- **Built-in feature windows** (ClipboardApp, JsonHelperApp, TotpApp) call `applyThemeFromConfig()` (`src/api/theme.ts`) on `useEffect` mount, independently load config and write CSS variables

### Must Follow for New Components/Windows

1. **Modals within main window** (BindingModal, SettingsPanel, etc.):
   - Background/border use CSS variables: `var(--theme-bg)`, `var(--theme-blur)`, `var(--theme-border)`
   - Provide fallback: `var(--theme-bg, rgba(22,24,40,0.97))`
   - Overlay **must not have background color** (transparent overlay)

2. **Independent Tauri windows** (new `XxxApp.tsx`):
   ```typescript
   // Call on component mount
   useEffect(() => { applyThemeFromConfig(); }, []);
   ```
   - Panel root element uses `className="glass"` instead of hardcoded `background`

3. **Prohibited**: Hardcode `rgba(22,24,40,...)` or `rgba(14,16,28,...)` in new components, always use `.glass` or CSS variables

4. **After SettingsPanel modifies theme**, `useEffect([theme])` in `App.tsx` automatically refreshes main window CSS variables; other windows only read config once on open (sufficient, as users typically close other windows when switching themes)

### ThemeConfig Fields

```typescript
interface ThemeConfig {
  bgColor: string;       // hex, e.g. "#10121f"
  bgOpacity: number;     // 0-1
  blurRadius: number;    // 0-60 px
  borderColor: string;   // hex (with alpha, e.g. "#ffffff1a")
  keyBgOpacity: number;  // 0-0.3, empty key background opacity
}
```

## Internationalization (i18n) Standards

### Current Status

Project UI is currently primarily in **Chinese**, but architecture should be prepared for bilingual (Chinese/English).

### Text Standards

1. **UI labels, buttons, tooltips**: New content must use **Chinese** (current product language), do not mix English
2. **Code comments**: Can mix Chinese and English, key logic recommended in English comments (for future internationalization)
3. **Error messages** (`Err(e.to_string())`, `console.error`): Can be English, not directly seen by users
4. **Action type metadata** (`ACTION_TYPE_META.label`), `BUILTIN_FEATURES.name`, `SYSTEM_PRESETS.name`: Unified Chinese

### Practices for Future i18n

1. **Do not inline UI text in logic**, centralize in component top constants or separate objects for easy future replacement with i18n keys:
   ```typescript
   // ✅
   const LABELS = { save: "保存", cancel: "取消" };
   // ❌ Scattered string literals
   ```

2. **`ACTION_TYPE_META`'s `label` field** is the single source for UI labels, new types must define Chinese name here, do not write separately in BindingModal

3. **Rust error messages** (`.ok_or("missing host")`) in English, if localization needed on frontend, do translation mapping on frontend

4. **Date/number formats**: No current requirement, reserve (do not use `new Date().toLocaleString("en-US")`, use API without locale)

### New Feature i18n Checklist

- [ ] New ActionType's `label` field filled with Chinese
- [ ] BindingModal tab names and form labels in Chinese
- [ ] Builtin features' `BUILTIN_FEATURES` entries filled with Chinese and English name/description
- [ ] System presets `SYSTEM_PRESETS.name` filled with Chinese
- [ ] Tauri window title (`tauri.conf.json`) filled with Chinese or App name

## Resources

### references/
Store detailed reference documentation to be loaded into context as needed:

- `references/api_reference.md` - API reference documentation
- `references/schema.md` - Database schemas or data structures
- `references/policies.md` - Company policies or project guidelines

### scripts/
Executable code for tasks requiring deterministic reliability:

- `scripts/validate_config.py` - Config file validation
- `scripts/generate_action_types.py` - Generate action type boilerplate

### assets/
Files used in output (templates, icons, etc.):

- `assets/component-templates/` - Component boilerplate code
- `assets/icon-templates/` - Icon templates
