# Pet Custom Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop pet menu with one fixed keyboard-mode button and up to three user-configurable actions edited from settings.

**Architecture:** Store pet custom menu actions in the existing `keyboard.yaml` `pet.menu.customActions` section. Normalize the config at the API boundary, build a typed pet menu model in `petLayout.ts`, render custom actions in `PetEntryApp.tsx`, and reuse `BindingModal` from the settings page for add/edit/clear.

**Tech Stack:** Tauri v2, Rust serde config types, React 19, TypeScript, Vitest.

---

## File Structure

- `app/src/types/actions.ts`: Extend `PetConfig` with `menu.customActions` and export slot-count/default helpers.
- `app/src/api/config.ts`: Normalize missing, short, or long pet menu config arrays and keep save output capped to three slots.
- `app/src/api/config.test.ts`: Cover old config compatibility and pet menu normalization.
- `app/src-tauri/src/types.rs`: Add Rust serde structs for `pet.menu.customActions`.
- `app/src/entry/petLayout.ts`: Replace fixed pet menu actions with a model builder that combines custom actions and the fixed keyboard button.
- `app/src/entry/petLayout.test.ts`: Update tests for custom action slots and fixed keyboard placement.
- `app/src/entry/PetEntryApp.tsx`: Load custom menu actions, render action icons, execute configured actions, and listen for settings updates.
- `app/src/components/BindingModal.tsx`: Allow the modal title and clear confirmation to use a custom label instead of only a keyboard key id.
- `app/src/components/SettingsPanel.tsx`: Add the Desktop pet menu slot editor and emit updates to the pet window.

## Task 1: Config Model And Normalization

**Files:**
- Modify: `app/src/types/actions.ts`
- Modify: `app/src/api/config.ts`
- Create: `app/src/api/config.test.ts`
- Modify: `app/src-tauri/src/types.rs`

- [ ] **Step 1: Write failing config normalization tests**

Create `app/src/api/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Action } from "@/types/actions";
import { PET_CUSTOM_ACTION_SLOT_COUNT } from "@/types/actions";
import { normalizeConfig, toRawConfig } from "./config";

const clipboardAction: Action = {
  type: "builtin",
  name: "剪切板",
  feature: "clipboard",
};

const jsonAction: Action = {
  type: "builtin",
  name: "JSON",
  feature: "json",
};

const urlAction: Action = {
  type: "url",
  name: "Open Docs",
  target: "https://example.com",
};

const scriptAction: Action = {
  type: "script",
  name: "Echo",
  shell: "terminal",
  content: "echo hello",
};

describe("config normalization", () => {
  it("adds an empty pet menu for old configs", () => {
    const config = normalizeConfig({ pages: [], pet: { codex: { enabled: true } } });

    expect(config.pet?.codex.enabled).toBe(true);
    expect(config.pet?.menu.customActions).toEqual([null, null, null]);
  });

  it("pads short pet custom action arrays to three slots", () => {
    const config = normalizeConfig({
      pages: [],
      pet: {
        codex: { enabled: false },
        menu: { customActions: [clipboardAction] },
      },
    });

    expect(config.pet?.menu.customActions).toEqual([clipboardAction, null, null]);
  });

  it("caps pet custom action arrays to three slots when saving", () => {
    const raw = toRawConfig({
      pages: [],
      theme: undefined,
      pet: {
        codex: { enabled: false },
        menu: { customActions: [clipboardAction, jsonAction, urlAction, scriptAction] },
      },
    });

    expect(raw.pet?.menu?.customActions).toHaveLength(PET_CUSTOM_ACTION_SLOT_COUNT);
    expect(raw.pet?.menu?.customActions).toEqual([clipboardAction, jsonAction, urlAction]);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd app
npm run test -- src/api/config.test.ts
```

Expected: FAIL because `normalizeConfig`, `toRawConfig`, and `PET_CUSTOM_ACTION_SLOT_COUNT` are not exported yet.

- [ ] **Step 3: Extend frontend action types**

In `app/src/types/actions.ts`, add the pet menu types near `PetConfig`:

```ts
export const PET_CUSTOM_ACTION_SLOT_COUNT = 3;

export interface PetMenuConfig {
  customActions: Array<Action | null>;
}

export interface PetConfig {
  codex: {
    enabled: boolean;
  };
  menu: PetMenuConfig;
}

export const DEFAULT_PET_CONFIG: PetConfig = {
  codex: {
    enabled: false,
  },
  menu: {
    customActions: Array.from({ length: PET_CUSTOM_ACTION_SLOT_COUNT }, () => null),
  },
};
```

Remove the old narrower `PetConfig` and `DEFAULT_PET_CONFIG` definitions so there is only one definition of each symbol.

- [ ] **Step 4: Export config normalization helpers**

In `app/src/api/config.ts`, update imports and raw types:

```ts
import type { KeyboardConfig, Action, PetConfig, ThemeConfig } from "@/types/actions";
import { DEFAULT_PET_CONFIG, DEFAULT_THEME, PET_CUSTOM_ACTION_SLOT_COUNT } from "@/types/actions";

interface RawPetMenuConfig {
  customActions?: Array<Action | null>;
}

interface RawPetConfig {
  codex?: {
    enabled?: boolean;
  };
  menu?: RawPetMenuConfig;
}

interface RawConfig {
  pages: RawPage[];
  theme?: ThemeConfig;
  pet?: RawPetConfig;
}
```

Add helpers before `normalizeConfig`:

```ts
export function normalizePetCustomActions(actions?: Array<Action | null>): Array<Action | null> {
  return Array.from({ length: PET_CUSTOM_ACTION_SLOT_COUNT }, (_, index) => actions?.[index] ?? null);
}

function normalizePetConfig(pet?: RawPetConfig): PetConfig {
  return {
    ...DEFAULT_PET_CONFIG,
    ...pet,
    codex: {
      enabled: false,
      ...pet?.codex,
    },
    menu: {
      customActions: normalizePetCustomActions(pet?.menu?.customActions),
    },
  };
}
```

Change `normalizeConfig` to export and call the helper:

```ts
export function normalizeConfig(raw: RawConfig): KeyboardConfig {
  return {
    pages: raw.pages.map((p) => ({
      name: p.name,
      keys: Object.fromEntries(
        Object.entries(p.keys).map(([k, action]) => [k, { action }])
      ),
    })),
    theme: raw.theme ?? { ...DEFAULT_THEME },
    pet: normalizePetConfig(raw.pet),
  };
}
```

Extract the save conversion into an exported helper:

```ts
export function toRawConfig(config: KeyboardConfig): RawConfig {
  return {
    pages: config.pages.map((p) => ({
      name: p.name,
      keys: Object.fromEntries(
        Object.entries(p.keys)
          .filter(([, v]) => v.action !== null)
          .map(([k, v]) => [k, v.action as Action])
      ),
    })),
    theme: config.theme,
    pet: config.pet ? {
      ...config.pet,
      menu: {
        customActions: normalizePetCustomActions(config.pet.menu?.customActions),
      },
    } : normalizePetConfig(undefined),
  };
}
```

Change `saveConfig` to use `toRawConfig(config)`.

- [ ] **Step 5: Extend Rust config structs**

In `app/src-tauri/src/types.rs`, add a pet menu struct above `PetConfig`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PetMenuConfig {
    #[serde(default, rename = "customActions")]
    pub custom_actions: Vec<Option<Action>>,
}
```

Update `PetConfig`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PetConfig {
    #[serde(default)]
    pub codex: PetCodexConfig,
    #[serde(default)]
    pub menu: PetMenuConfig,
}
```

- [ ] **Step 6: Run config tests**

Run:

```bash
cd app
npm run test -- src/api/config.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit task 1**

Run:

```bash
git add app/src/types/actions.ts app/src/api/config.ts app/src/api/config.test.ts app/src-tauri/src/types.rs
git commit -m "feat: add pet menu config model"
```

If the working tree contains unrelated user changes, skip this commit and note the affected files in the task result.

## Task 2: Pet Menu Model

**Files:**
- Modify: `app/src/entry/petLayout.ts`
- Modify: `app/src/entry/petLayout.test.ts`

- [ ] **Step 1: Replace fixed-menu expectations with custom-menu tests**

Update `app/src/entry/petLayout.test.ts` imports to include `buildPetMenuItems` and `PET_KEYBOARD_MENU_ITEM`.

Replace the old fixed action tests with:

```ts
import type { Action } from "@/types/actions";

const clipboardAction: Action = {
  type: "builtin",
  name: "剪切板",
  feature: "clipboard",
};

const jsonAction: Action = {
  type: "builtin",
  name: "JSON",
  feature: "json",
};

const docsAction: Action = {
  type: "url",
  name: "Docs",
  target: "https://example.com",
};

it("shows only fixed keyboard mode when no custom actions are configured", () => {
  expect(buildPetMenuItems([null, null, null])).toEqual([PET_KEYBOARD_MENU_ITEM]);
});

it("combines up to three custom actions with the fixed keyboard item", () => {
  const items = buildPetMenuItems([clipboardAction, jsonAction, docsAction]);

  expect(items.map((item) => item.kind)).toEqual(["custom", "custom", "custom", "keyboard"]);
  expect(items.map((item) => item.label)).toEqual(["剪切板", "JSON", "Docs", "键盘"]);
  expect(items.map((item) => [item.left, item.top])).toEqual([
    [42, 36],
    [130, 36],
    [42, 116],
    [130, 116],
  ]);
});

it("keeps the fixed keyboard button in the bottom-right position", () => {
  expect(PET_KEYBOARD_MENU_ITEM).toMatchObject({
    kind: "keyboard",
    label: "键盘",
    left: 130,
    top: 116,
  });
});
```

- [ ] **Step 2: Run pet layout tests and verify they fail**

Run:

```bash
cd app
npm run test -- src/entry/petLayout.test.ts
```

Expected: FAIL because `buildPetMenuItems` and `PET_KEYBOARD_MENU_ITEM` do not exist.

- [ ] **Step 3: Implement the pet menu model**

In `app/src/entry/petLayout.ts`, import `Action` and replace the old `PetAction` / `PET_MENU_ITEMS` definitions with:

```ts
import type { Action } from "@/types/actions";

export type PetFixedAction = "keyboard";

export type PetMenuItem =
  | {
      kind: "custom";
      slotIndex: number;
      label: string;
      title: string;
      left: number;
      top: number;
      action: Action;
    }
  | {
      kind: "keyboard";
      label: string;
      title: string;
      left: number;
      top: number;
      action: PetFixedAction;
    };

export const PET_CUSTOM_MENU_POSITIONS = [
  { left: 42, top: 36 },
  { left: 130, top: 36 },
  { left: 42, top: 116 },
] as const;

export const PET_KEYBOARD_MENU_ITEM: PetMenuItem = {
  kind: "keyboard",
  label: "键盘",
  title: "切换到键盘模式",
  left: 130,
  top: 116,
  action: "keyboard",
};

export function buildPetMenuItems(customActions: Array<Action | null | undefined>): PetMenuItem[] {
  const customItems = PET_CUSTOM_MENU_POSITIONS.flatMap((position, index) => {
    const action = customActions[index];
    if (!action) return [];

    return [{
      kind: "custom" as const,
      slotIndex: index,
      label: action.name,
      title: action.name,
      left: position.left,
      top: position.top,
      action,
    }];
  });

  return [...customItems, PET_KEYBOARD_MENU_ITEM];
}
```

- [ ] **Step 4: Run pet layout tests**

Run:

```bash
cd app
npm run test -- src/entry/petLayout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit task 2**

Run:

```bash
git add app/src/entry/petLayout.ts app/src/entry/petLayout.test.ts
git commit -m "feat: model custom pet menu items"
```

If unrelated user changes are present, skip this commit and note the affected files in the task result.

## Task 3: Pet Menu Rendering And Execution

**Files:**
- Modify: `app/src/entry/PetEntryApp.tsx`
- Modify: `app/src/launcher/actionExecutor.ts`
- Test: `app/src/launcher/actionExecutor.test.ts`

- [ ] **Step 1: Add direct action execution tests**

Open `app/src/launcher/actionExecutor.test.ts` and add tests for direct `Action` execution:

```ts
import type { Action } from "@/types/actions";
import { executeAction } from "./actionExecutor";

it("toggles builtin actions when executing a direct action", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const action: Action = { type: "builtin", name: "剪切板", feature: "clipboard" };

  await executeAction(action, {
    invoke: async (command, args) => {
      calls.push([command, args]);
    },
  });

  expect(calls).toEqual([["show_clipboard_window", undefined]]);
});

it("uses execute_action for non-builtin direct actions", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const action: Action = { type: "url", name: "Docs", target: "https://example.com" };

  await executeAction(action, {
    invoke: async (command, args) => {
      calls.push([command, args]);
    },
  });

  expect(calls).toEqual([["execute_action", { action }]]);
});
```

- [ ] **Step 2: Run action executor tests and verify they fail**

Run:

```bash
cd app
npm run test -- src/launcher/actionExecutor.test.ts
```

Expected: FAIL because `executeAction` is not exported.

- [ ] **Step 3: Add a reusable direct action executor**

In `app/src/launcher/actionExecutor.ts`, import `Action` and add:

```ts
import type { Action, BuiltinFeature } from "@/types/actions";
```

Then add this function above `executeLauncherAction`:

```ts
export async function executeAction(
  action: Action,
  deps: ActionExecutorDeps,
): Promise<void> {
  if (action.type === "builtin") {
    await deps.invoke(builtinToggleCommand(action.feature));
    return;
  }

  await deps.invoke("execute_action", { action });
}
```

Update `executeLauncherAction` so keyboard and search actions reuse the same helper:

```ts
if (record.actionKind === "execute-action") {
  if (!record.action) throw new Error(`Missing action for ${record.id}`);
  await executeAction(record.action, deps);
  return;
}
```

- [ ] **Step 4: Run action executor tests**

Run:

```bash
cd app
npm run test -- src/launcher/actionExecutor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Render custom pet actions**

In `app/src/entry/PetEntryApp.tsx`:

1. Replace the fixed icon imports:

```ts
import { KeyboardIcon } from "@/icons/entryIcons";
import { ActionIcon } from "@/components/ActionIcon";
import { executeAction } from "@/launcher/actionExecutor";
```

2. Replace `PET_MENU_ITEMS` and `PetAction` imports with:

```ts
  buildPetMenuItems,
  type PetMenuItem,
```

3. Add state near the other pet state:

```ts
const [customMenuActions, setCustomMenuActions] = useState<Array<Action | null>>([]);
const menuItems = buildPetMenuItems(customMenuActions);
```

4. Import `Action`:

```ts
import type { Action } from "@/types/actions";
```

5. In the existing `loadConfig()` effect, after `setCodexEnabled(enabled)`, add:

```ts
setCustomMenuActions(config.pet?.menu.customActions ?? []);
```

6. Add an event listener in the same effect:

```ts
let unlistenPetMenu: (() => void) | null = null;

listen<Array<Action | null>>("pet-menu-config-changed", (event) => {
  setCustomMenuActions(event.payload);
})
  .then((unlisten) => {
    unlistenPetMenu = unlisten;
  })
  .catch(console.error);
```

Return cleanup should call both listeners:

```ts
if (unlistenCodexStatus) unlistenCodexStatus();
if (unlistenPetMenu) unlistenPetMenu();
```

7. Replace `PET_MENU_ITEMS` usages in animation and rendering with `menuItems`.

8. Replace `PetActionIcon` with:

```tsx
function PetMenuItemIcon({ item }: { item: PetMenuItem }) {
  if (item.kind === "keyboard") return <KeyboardIcon size={18} />;
  return <ActionIcon action={item.action} size={18} />;
}
```

9. Replace `runAction` with:

```ts
async function runMenuItem(item: PetMenuItem) {
  closePetMenu();
  if (item.kind === "keyboard") {
    await switchToKeyboard();
    return;
  }

  await executeAction(item.action, { invoke });
}
```

10. Render each button using:

```tsx
{menuItems.map((item) => (
  <button
    key={item.kind === "keyboard" ? "keyboard" : `custom-${item.slotIndex}`}
    className="pet-action-button"
    onClick={() => runMenuItem(item).catch(console.error)}
    style={{
      ...actionButtonStyle,
      left: item.left,
      top: item.top,
      opacity: open ? 1 : 0,
      visibility: open ? "visible" : "hidden",
      transform: open ? "translate(-50%, -50%) scale(1)" : actionButtonStyle.transform,
    }}
    data-pet-action={item.kind === "keyboard" ? "keyboard" : `custom-${item.slotIndex}`}
    aria-label={item.label}
    title={item.title}
    type="button"
  >
    <PetMenuItemIcon item={item} />
  </button>
))}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd app
npm run test -- src/launcher/actionExecutor.test.ts src/entry/petLayout.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit task 3**

Run:

```bash
git add app/src/entry/PetEntryApp.tsx app/src/launcher/actionExecutor.ts app/src/launcher/actionExecutor.test.ts
git commit -m "feat: render custom pet menu actions"
```

If unrelated user changes are present, skip this commit and note the affected files in the task result.

## Task 4: Settings Slot Editor

**Files:**
- Modify: `app/src/components/BindingModal.tsx`
- Modify: `app/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Make BindingModal accept a custom display label**

In `app/src/components/BindingModal.tsx`, change props:

```ts
interface BindingModalProps {
  keyId: string;
  bindingLabel?: string;
  initialAction?: Action | null;
  onClose: () => void;
  onSave: (action: Action) => void;
  onClear?: () => void;
}
```

Change the component signature:

```ts
export function BindingModal({ keyId, bindingLabel, initialAction, onClose, onSave, onClear }: BindingModalProps) {
  const displayLabel = bindingLabel ?? keyId;
```

Change the title text:

```tsx
绑定 <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>[{displayLabel}]</span>
```

Change the clear confirmation:

```ts
if (!window.confirm(`清除 ${displayLabel} 的绑定？已保存的相关密码也会删除。`)) return;
```

- [ ] **Step 2: Add SettingsPanel imports and state**

In `app/src/components/SettingsPanel.tsx`, update imports:

```ts
import { emit } from "@tauri-apps/api/event";
import { BindingModal } from "@/components/BindingModal";
import { ActionIcon } from "@/components/ActionIcon";
import { PET_CUSTOM_ACTION_SLOT_COUNT } from "@/types/actions";
import type { Action, KeyId, KeyMap, KeyboardConfig, ThemeConfig, UrlAction } from "@/types/actions";
```

Add state near the other `useState` calls:

```ts
const [petMenuEditIndex, setPetMenuEditIndex] = useState<number | null>(null);
```

- [ ] **Step 3: Add pet menu save helpers**

Inside `SettingsPanel`, add:

```ts
const petMenuActions = useMemo(
  () => Array.from(
    { length: PET_CUSTOM_ACTION_SLOT_COUNT },
    (_, index) => config?.pet?.menu.customActions?.[index] ?? null,
  ),
  [config],
);

async function persistPetMenuAction(index: number, action: Action | null) {
  if (!config) return;

  const nextActions = Array.from(
    { length: PET_CUSTOM_ACTION_SLOT_COUNT },
    (_, slotIndex) => slotIndex === index ? action : petMenuActions[slotIndex],
  );

  const nextConfig: KeyboardConfig = {
    ...config,
    pet: {
      ...config.pet,
      codex: {
        enabled: Boolean(config.pet?.codex?.enabled),
      },
      menu: {
        customActions: nextActions,
      },
    },
  };

  setConfig(nextConfig);
  await saveConfig(nextConfig);
  await emit("pet-menu-config-changed", nextActions);
  setStatus(action ? "宠物菜单已更新。" : "宠物菜单绑定已清空。");
}
```

- [ ] **Step 4: Render three menu slots in Desktop pet settings**

Inside the Desktop pet settings panel, below the Codex text, add:

```tsx
<div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
  <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.76)", marginBottom: 8 }}>
    菜单快捷入口
  </div>
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
    {petMenuActions.map((action, index) => (
      <button
        key={index}
        type="button"
        onClick={() => setPetMenuEditIndex(index)}
        disabled={!config}
        style={{
          minHeight: 68,
          borderRadius: 9,
          border: action ? "1px solid rgba(125,211,252,0.34)" : "1px dashed rgba(255,255,255,0.22)",
          background: action ? "rgba(14,165,233,0.12)" : "rgba(255,255,255,0.045)",
          color: "rgba(255,255,255,0.78)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          cursor: config ? "pointer" : "default",
        }}
      >
        {action ? (
          <>
            <ActionIcon action={action} size={24} />
            <span style={{ fontSize: 11, fontWeight: 800, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {action.name}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>添加</span>
          </>
        )}
      </button>
    ))}
  </div>
  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.42)", lineHeight: 1.6 }}>
    宠物菜单固定保留键盘模式；这里最多添加 3 个自定义入口。
  </div>
</div>
```

- [ ] **Step 5: Render BindingModal for pet menu editing**

At the end of `SettingsPanel` render output, add:

```tsx
{petMenuEditIndex !== null && (
  <BindingModal
    keyId={`pet-menu-${petMenuEditIndex + 1}`}
    bindingLabel={`宠物菜单 ${petMenuEditIndex + 1}`}
    initialAction={petMenuActions[petMenuEditIndex]}
    onClose={() => setPetMenuEditIndex(null)}
    onSave={(action) => {
      const index = petMenuEditIndex;
      setPetMenuEditIndex(null);
      void persistPetMenuAction(index, action).catch((error) => setStatus(String(error)));
    }}
    onClear={() => {
      const index = petMenuEditIndex;
      setPetMenuEditIndex(null);
      void persistPetMenuAction(index, null).catch((error) => setStatus(String(error)));
    }}
  />
)}
```

- [ ] **Step 6: Run TypeScript build**

Run:

```bash
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit task 4**

Run:

```bash
git add app/src/components/BindingModal.tsx app/src/components/SettingsPanel.tsx
git commit -m "feat: add pet menu settings editor"
```

If unrelated user changes are present, skip this commit and note the affected files in the task result.

## Task 5: Full Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd app
npm run test -- src/api/config.test.ts src/entry/petLayout.test.ts src/launcher/actionExecutor.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run all frontend tests**

Run:

```bash
cd app
npm run test
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run Rust check**

Run:

```bash
cd app/src-tauri
cargo check
```

Expected: PASS.

- [ ] **Step 5: Manual macOS QA**

Run:

```bash
cd app
npm run tauri:dev:mac
```

Verify:

- with no `pet.menu`, the pet menu shows only keyboard mode
- settings -> entrance -> Desktop pet shows three empty menu slots
- add builtin clipboard to slot 1
- pet menu shows clipboard plus keyboard
- clicking clipboard opens clipboard and closes the pet menu
- edit slot 1 to a URL action
- pet menu executes the URL action
- clear slot 1
- pet menu hides slot 1 and still shows keyboard mode
- restart the app and confirm configured actions persist
- Codex linkage toggle still saves and reloads

- [ ] **Step 6: Final commit**

If task commits were skipped and the user asks for a commit, run:

```bash
git status --short
git add app/src/types/actions.ts app/src/api/config.ts app/src/api/config.test.ts app/src-tauri/src/types.rs app/src/entry/petLayout.ts app/src/entry/petLayout.test.ts app/src/entry/PetEntryApp.tsx app/src/launcher/actionExecutor.ts app/src/launcher/actionExecutor.test.ts app/src/components/BindingModal.tsx app/src/components/SettingsPanel.tsx
git commit -m "feat: customize desktop pet menu"
```

Expected: one commit containing only the pet custom menu implementation.

## Self-Review

Spec coverage:

- Fixed keyboard-mode button: Task 2 and Task 3.
- Three custom action slots: Task 1, Task 2, and Task 4.
- Same binding logic as virtual keyboard: Task 4 reuses `BindingModal`.
- Save in `keyboard.yaml`: Task 1 extends `PetConfig` and `saveConfig`.
- Execute builtin and non-builtin actions: Task 3.
- Old config compatibility: Task 1 tests.
- Pet menu hides empty slots: Task 2 model tests and Task 3 rendering.
- Manual persistence and Codex linkage checks: Task 5.

Placeholder scan:

- No open-ended implementation placeholders are used.
- All code-changing steps include concrete snippets.
- Commands include expected outcomes.

Type consistency:

- `PetConfig.menu.customActions` is defined in Task 1 and used in Tasks 3 and 4.
- `buildPetMenuItems` is defined in Task 2 and used in Task 3.
- `executeAction` is defined in Task 3 and used by `PetEntryApp`.
