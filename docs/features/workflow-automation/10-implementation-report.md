# Implementation Report

Date: 2026-07-18
Release boundary: Workflow Automation MVP

## Delivered

- Persisted schema version, revision, workflows, steps, conditions, completion
  rules, failure policies, and workflow key bindings.
- Backward-compatible loading for configurations without workflow fields.
- Atomic configuration writes.
- A three-column workflow manager integrated into the main window.
- The launcher expands to a display-aware workspace capped at `1180 x 680`
  while the manager is open, supports title-bar dragging, and restores its
  compact size on close.
- Existing action editor reuse for workflow steps.
- Workflow steps can launch existing built-in features and installed plugins.
- Workflow binding is integrated into the standard key-binding dialog; the
  workflow manager has no duplicate page/key picker.
- Dangling workflow bindings are cleaned when their workflow is deleted.
- Sequential execution with step delays, conditions, visible status, failure
  policy, cancellation, and manual confirmation.
- Independent execution for an enabled step, with standalone status, terminal
  output, and cancellation.
- Persisted minute-interval and daily-local-time scheduling while DevLauncher is
  running; scheduled workflows show an “自启动” marker, identify their trigger,
  and reuse the normal run monitor and stop control.
- Completion adapters for action return, launch stabilization, managed script
  exit, TCP port readiness, timer, and manual confirmation.
- All workflow scripts execute in a managed PTY without opening the standalone
  terminal window.
- Ordered terminal output supports live streaming, retained snapshots, late
  subscription replay, complete copyable logs, and bounded final summaries.
- The embedded run terminal forwards keyboard input to its active PTY, so
  interactive programs and standard `Ctrl+C` work normally.
- The expanded terminal keeps workflow cancellation separate from terminal
  process control. After workflow completion, a still-active detached process
  exposes `关闭终端` in the fixed terminal toolbar.
- PTY sessions retain a cloned child killer so closing a terminal terminates
  its process instead of only dropping the visible session.
- A dependency-free local MCP server and Codex plugin.
- Shared `devlauncherctl` mutation boundary with validation, atomic writes, and
  optimistic revision checks.
- MCP capability/list/get/preview/apply/bind/delete/unbind tools.
- Secret-field rejection and deterministic risk findings for generated drafts.

## Deferred

- MCP-triggered run, cancel, and status require a desktop runtime bridge.
- `window_ready`, `url_ready`, and `connection_ready` remain schema-reserved and
  fail validation until platform adapters exist.
- Arbitrary GUI process liveness is not observable through the current launcher;
  `process_started` is a documented stabilization heuristic.
- Persistent cross-restart audit history remains a future addition; current run
  output is retained for the desktop process lifetime.
- Calendar/cron expressions and offline catch-up execution remain deferred.

## Repository Evidence

- `app/src/components/WorkflowPanel.tsx`
- `app/src/api/workflow.ts`
- `app/src/launcher/actionExecutor.ts`
- `app/src-tauri/src/workflow.rs`
- `app/src-tauri/src/bin/devlauncherctl.rs`
- `plugins/devlauncher-automation/`
- `scripts/test-automation-mcp.mjs`

## Verification Evidence

- Current regression suite: 31 frontend files and 142 tests passed.
- Current Rust suite: 105 tests passed.
- Current frontend production build and Cargo all-target check passed.

- Frontend unit tests: 85 passed.
- Frontend production build: passed.
- Rust tests: 48 passed, including 4 workflow-engine tests.
- Rust compile check: passed.
- Isolated configuration transaction:
  preview, create, bind, list, and revision conflict passed.
- MCP initialize, tools/list, and preview smoke test: passed.
