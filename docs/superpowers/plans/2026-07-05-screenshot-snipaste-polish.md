# Screenshot Snipaste Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the screenshot tool respond immediately, support both drag selection and full-screen selection, and keep cursor hints, toolbars, and text annotations inside the visible screen.

**Architecture:** Keep the existing Tauri screenshot command and React screenshot app. Add a small geometry helper module for clamp/placement logic, then use it from the current screenshot component so the large component does less coordinate math inline.

**Tech Stack:** Tauri Rust commands, React 19, TypeScript, Vitest.

---

### Task 1: Geometry Helpers

**Files:**
- Create: `app/src/builtins/screenshot/geometry.ts`
- Create: `app/src/builtins/screenshot/geometry.test.ts`

- [ ] Add exported helpers for clamping points, rectangles, floating panels, text widths, and full-image fit rectangles.
- [ ] Test toolbar placement near top, bottom, left, and right edges.
- [ ] Test text positions and full-image rectangles stay inside the viewport.

### Task 2: Screenshot Command Responsiveness

**Files:**
- Modify: `app/src-tauri/src/builtins/screenshot.rs`

- [ ] Show and focus the overlay before capture so users get immediate feedback.
- [ ] Emit a `screenshot-error` event when native capture fails.
- [ ] Keep image delivery through `screenshot-ready` for compatibility.

### Task 3: Snipaste-Like Selection UX

**Files:**
- Modify: `app/src/builtins/screenshot/App.tsx`

- [ ] Add fullscreen selection through a toolbar button and `F` key.
- [ ] Add crosshair guide lines and a coordinate/selection badge near the cursor.
- [ ] Clamp selection moves/resizes to the displayed screenshot bounds.
- [ ] Make right-click cancel, Esc cancel, and Enter confirm behavior remain intact.

### Task 4: Text And Toolbar Safety

**Files:**
- Modify: `app/src/builtins/screenshot/App.tsx`

- [ ] Replace fixed-width note placement with helper-based clamped positions.
- [ ] Clamp text input and selected annotation note inputs.
- [ ] Let toolbar wrap on narrow screens instead of overflowing horizontally.

### Task 5: Verification

**Files:**
- Run: `npm test -- screenshot/geometry`
- Run: `npm run build`

- [ ] Confirm geometry tests pass.
- [ ] Confirm TypeScript and Vite build pass.
