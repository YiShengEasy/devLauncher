# Pet Codex Status Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe opt-in Codex status bridge for the desktop pet.

**Architecture:** Persist `pet.codex.enabled` in the existing keyboard config. Keep Codex status as a separate pet event so current sprite actions and shortcut menu behavior remain stable. The pet reads the toggle locally and ignores status events while the toggle is off.

**Tech Stack:** React, TypeScript, Vitest, Tauri Rust commands, serde YAML config.

---

### Task 1: Add Config And Status Types

**Files:**
- Modify: `app/src/types/actions.ts`
- Modify: `app/src/api/config.ts`
- Modify: `app/src-tauri/src/types.rs`
- Create: `app/src/entry/petCodexStatus.ts`
- Test: `app/src/entry/petCodexStatus.test.ts`

- [x] Add `PetConfig` and default config.
- [x] Normalize missing config fields to disabled Codex linkage.
- [x] Add pure status normalization tests.

### Task 2: Add Settings Toggle

**Files:**
- Modify: `app/src/components/SettingsPanel.tsx`

- [x] Add a Codex linkage switch inside Entry settings.
- [x] Persist the toggle through existing `saveConfig`.
- [x] Mirror the toggle to localStorage for the pet entry window.

### Task 3: Add Pet Status Bridge

**Files:**
- Modify: `app/src/entry/PetEntryApp.tsx`
- Modify: `app/src-tauri/src/entries.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [x] Add `pet-codex-status` event.
- [x] Ignore Codex events while disabled.
- [x] Show a compact status badge and message.
- [x] Register `set_pet_codex_status` as a Tauri command.

### Task 4: Verify

**Commands:**
- `npm test` from `app`
- `npm run build` from `app`
- `cargo check` from `app/src-tauri`

- [x] Run focused tests.
- [x] Run build.
- [x] Report any environment blockers: `cargo check` is blocked by local `rustc 1.87.0`; current dependencies require `rustc 1.88+`.
