# Website Action Type Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent nine-type introduction carousel to the homepage virtual-keyboard demo without changing its five-step operation animation or compact key layout.

**Architecture:** A static mount point lives below the keyboard stage. `website/src/main.js` owns the type metadata and independently advances `typeIndex`; `website/src/styles.css` presents the active description and compact type labels in the existing glass-panel visual language.

**Tech Stack:** Static HTML, CSS, browser JavaScript, existing website build script.

---

### Task 1: Add The Type Explorer State And Markup

**Files:**
- Modify: `website/index.html`
- Modify: `website/src/main.js`

- [ ] **Step 1: Add the explorer mount point**

Insert this after `.keyboard-stage`:

```html
<div class="action-type-explorer" id="actionTypeExplorer" aria-live="polite"></div>
```

- [ ] **Step 2: Define all supported action types**

Add a nine-entry `actionTypes` array with `code`, `name`, `detail`, and `accent` fields for application, folder, file, URL, SSH, script, system, built-in, and plugin bindings.

- [ ] **Step 3: Render and advance the active type**

Render one active description plus all compact labels. Advance `typeIndex` with an independent recursive timeout so changing the type does not mutate `stepIndex` or rerender the keyboard.

- [ ] **Step 4: Update asset versions**

Change both website CSS and JavaScript query versions in `website/index.html` to `2026071603` so local and deployed pages do not reuse the previous assets.

### Task 2: Style Responsive Type Introductions

**Files:**
- Modify: `website/src/styles.css`

- [ ] **Step 1: Add the desktop explorer layout**

Use a two-column grid with a constrained description area and a nine-column compact type switcher. Keep borders, accent glow, radius, and typography aligned with the existing keyboard inspector.

- [ ] **Step 2: Add compact mobile behavior**

At `max-width: 640px`, stack the description above a three-column type grid. Ensure labels wrap inside the keyboard window without horizontal page overflow.

- [ ] **Step 3: Respect reduced motion**

Disable decorative active-label animation under `prefers-reduced-motion: reduce` while preserving readable state changes.

### Task 3: Verify And Publish

**Files:**
- Verify: `website/index.html`
- Verify: `website/src/main.js`
- Verify: `website/src/styles.css`

- [ ] **Step 1: Run syntax and state tests**

Run `node --check website/src/main.js` and a VM-based DOM harness. Expected result: nine unique type states, five unchanged operation states, and one active item in each group.

- [ ] **Step 2: Run static validation**

Run `npm --prefix website run build`, `git diff --check`, and strict UTF-8 conversion checks. Expected result: all commands exit successfully.

- [ ] **Step 3: Commit and push**

Stage only the website implementation files, commit with `feat: restore website action type guide`, then push `main` to `origin`.

- [ ] **Step 4: Verify GitHub Pages**

Wait for the deploy workflow to complete and confirm the live HTML, JavaScript, and CSS contain the `actionTypeExplorer` mount and asset version `2026071603`.
