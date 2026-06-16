# Keyboard Theme Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved final dark DevLauncher prototype style to the live virtual keyboard and expose the prototype's warm and aurora themes as settings presets.

**Architecture:** Keep the current `ThemeConfig` shape and persistence path. `KeyCell.tsx` owns keycap rendering details, while `SettingsPanel.tsx` owns preset selection and `actions.ts` owns the default theme fallback.

**Tech Stack:** React, TypeScript, Zustand theme state, existing inline-style component patterns.

---

### Task 1: Theme Presets

**Files:**
- Modify: `app/src/types/actions.ts`
- Modify: `app/src/components/SettingsPanel.tsx`

- [x] **Step 1: Set the default theme to the classic prototype baseline**

Use `bgColor: "#101622"`, high opacity, restrained blur, classic shell border, and a low key opacity for dark resin keycaps.

- [x] **Step 2: Replace old preset labels with final presets**

Expose only these settings presets in this order: `经典黑`, `暖棕`, `蓝紫`. Preserve the existing manual color/opacity/blur controls below the preset buttons.

### Task 2: Keycap Rendering

**Files:**
- Modify: `app/src/components/KeyCell.tsx`

- [x] **Step 1: Replace per-action filled backgrounds**

Use one unified low-saturation dark keycap surface for bound and unbound keys, with action color reserved for icon and subtle accent glow.

- [x] **Step 2: Match prototype typography and content hierarchy**

Top-left hint remains visible, action type labels are removed from the key body, icon is centered above the action name, and empty keys keep the same dark keycap surface.

- [x] **Step 3: Preserve interactions**

Left click executes, right click edits, empty click binds, drag/drop swap behavior remains unchanged.

### Task 3: Verification

**Files:**
- Test command: `npm run build` from `app/`

- [x] **Step 1: Run TypeScript and Vite build**

Expected: build completes without type or bundling errors.

- [x] **Step 2: Review git diff**

Expected: only the plan, theme defaults/presets, and keyboard keycap rendering changed.
