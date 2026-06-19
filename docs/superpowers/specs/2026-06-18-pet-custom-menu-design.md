# Pet Custom Menu Design

## Goal

Let the desktop pet menu keep one fixed keyboard-mode button and let users
choose up to three custom menu actions from settings.

The custom action editing flow should match the virtual keyboard binding flow:
users choose the same action types, use the same fields, and save into the same
main config file.

## Selected Approach

Use option A: extend the existing `pet` section in `keyboard.yaml`.

The pet menu should not get a separate storage file. Keeping the menu in
`keyboard.yaml` makes backup, migration, and editing consistent with virtual
keyboard bindings.

## Current State

The pet menu is currently defined in `app/src/entry/petLayout.ts` as four fixed
items:

- search
- screenshot report
- clipboard
- keyboard mode

`app/src/entry/PetEntryApp.tsx` executes these fixed pet actions directly.

The virtual keyboard binding modal already supports the shared `Action` model:

- app
- folder
- file
- url
- ssh
- script
- system
- builtin

The settings page already has a Desktop pet section in
`app/src/components/SettingsPanel.tsx`, and the shared config type already has a
`pet` section.

## Functional Requirements

The pet menu has one fixed item:

- keyboard mode

Users can configure up to three custom actions.

The custom actions:

- use the existing `Action` type
- are edited with the existing binding modal
- are saved in `keyboard.yaml`
- are independent from virtual keyboard key bindings
- can be added, edited, or cleared from settings

If no custom actions are configured, the pet menu shows only the keyboard-mode
button.

## Config Shape

Extend the frontend and Rust `PetConfig` shape with a menu section.

Example:

```yaml
pet:
  codex:
    enabled: false
  menu:
    customActions:
      - type: builtin
        name: 剪切板
        feature: clipboard
      - null
      - null
```

Rules:

- `customActions` has at most three slots.
- missing `pet.menu` means no custom actions.
- missing or shorter `customActions` arrays are normalized to three slots in
  the frontend.
- extra actions beyond three are ignored by the UI and should not be written
  back on the next save.

The fixed keyboard-mode button is not stored in config.

## Settings UI

Add a "菜单快捷入口" area inside the existing Desktop pet settings block.

It shows three compact slots:

- empty slot: add button
- filled slot: action icon, action name, and action type
- filled slot controls: edit and clear

Clicking add or edit opens the existing `BindingModal`.

For this use case, the binding modal should receive a display label such as
`宠物菜单 1`, `宠物菜单 2`, or `宠物菜单 3` instead of a keyboard key name. The
modal behavior otherwise stays the same.

Saving a slot updates `config.pet.menu.customActions[index]` and then calls the
existing `saveConfig`.

Clearing a slot writes `null` at that slot and saves.

## Pet Menu UI

The expanded pet menu renders up to four buttons:

- configured custom action slots, in slot order
- the fixed keyboard-mode button

Empty custom slots are hidden in the pet menu. They are only visible in
settings.

The existing four-corner layout should be reused. When fewer than four buttons
are visible, positions should stay stable and easy to click. The fixed keyboard
button should remain in the bottom-right position.

## Execution

Custom actions use the same execution rules as search and keyboard bindings:

- builtin actions call the existing builtin window toggle command
- all other actions call `execute_action`

The fixed keyboard-mode button continues to call the existing pet-to-keyboard
transition logic.

After executing any custom action, the pet menu closes.

## Error Handling

If config loading fails, the pet should fall back to an empty custom-action list
and still show the fixed keyboard-mode button.

If a custom action fails to execute, the error should be logged and the pet menu
should close normally. The failure should not break pet dragging, opening, or
keyboard-mode switching.

Invalid or unsupported custom action data should be skipped when rendering the
pet menu and should not block the fixed keyboard button.

## Compatibility

Existing `keyboard.yaml` files without `pet.menu` remain valid.

Existing `pet.codex.enabled` behavior is unchanged.

The old fixed search, screenshot report, and clipboard buttons are no longer
shown by default. Users can add equivalent builtin actions from settings.

## Implementation Notes

Expected files to update:

- `app/src/types/actions.ts`
- `app/src-tauri/src/types.rs`
- `app/src/api/config.ts`
- `app/src/components/BindingModal.tsx`
- `app/src/components/SettingsPanel.tsx`
- `app/src/entry/petLayout.ts`
- `app/src/entry/PetEntryApp.tsx`
- related tests under `app/src/entry` or config/model tests

Useful existing helpers:

- `BindingModal` for editing an `Action`
- `ActionIcon` for rendering action icons
- `execute_action` Tauri command for non-builtin actions
- builtin toggle command mapping used by launcher action execution

## Verification

Automated checks:

- old config without `pet.menu` normalizes successfully
- pet menu custom actions are capped to three slots
- saving a custom slot writes the expected config shape
- clearing a custom slot writes `null`
- fixed keyboard-mode action is always present in the pet menu model
- existing pet layout tests are updated for the new menu behavior

Manual QA:

- start with no `pet.menu`: pet menu shows only keyboard mode
- add a builtin clipboard action: pet menu shows clipboard plus keyboard
- click clipboard from pet menu: clipboard opens and pet menu closes
- add a URL or script action: pet menu executes it through `execute_action`
- edit a slot: pet menu uses the new action
- clear a slot: pet menu hides that action
- restart app: configured pet menu actions persist
- Codex linkage setting still saves and loads
