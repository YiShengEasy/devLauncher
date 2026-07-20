# Implementation Plan

## Phase 0: Documentation

- [x] Create unified `docs/features/<feature>/` convention.
- [x] Capture requirements, UX, domain, engine, MCP, security, and tests.
- [x] Link the approved HTML prototype.

## Phase 1: Domain and Persistence

- [x] Add TypeScript workflow, condition, completion, and run types.
- [x] Add Rust serde equivalents with backward-compatible defaults.
- [x] Add `workflows`, `schemaVersion`, and `revision` to configuration.
- [x] Normalize legacy frontend configuration.
- [x] Add atomic configuration writes and revision-aware mutation helpers.
- [x] Include workflows in cloud-sync snapshots through `KeyboardConfig`.
- [x] Add unit tests for legacy and workflow configuration.

## Phase 2: Execution Engine

- [x] Add workflow validation.
- [x] Add declarative condition evaluation.
- [x] Add action-resolved, timer, and port-ready completion.
- [x] Add managed script process-exit execution.
- [x] Add launch-stabilization process-started completion.
- [x] Add cancellation and run status.
- [x] Add standalone single-step execution through the existing engine.
- [x] Add persisted interval/daily schedules and the desktop scheduler loop.
- [x] Register Tauri commands and events.
- [x] Add Rust tests.

## Phase 3: Product UI

- [x] Add workflow manager entry in the main header.
- [x] Implement workflow list and editor.
- [x] Reuse the existing action binding editor for step actions.
- [x] Implement condition and completion controls.
- [x] Implement reorder, duplicate, enable, delete, and save.
- [x] Implement page/key binding with replacement confirmation.
- [x] Show run status, current step, failure, and cancellation.
- [x] Add per-step “run separately” controls, schedule configuration, and
  auto-start markers.
- [x] Add a workflow action icon and keyboard execution support.

## Phase 4: Automation MCP

- [x] Add local automation MCP server.
- [x] Add capabilities/list/get tools.
- [x] Add preview/apply/delete tools.
- [x] Add bind/unbind tools.
- [ ] Add run/cancel/status tools through a later desktop bridge.
- [x] Add deterministic validation and risk checks.
- [x] Package as a Codex plugin beside the pet plugin.
- [x] Add installation documentation and smoke test.

## Phase 5: Verification

- [x] Run UTF-8 validation.
- [x] Run frontend unit tests.
- [x] Run frontend build.
- [x] Run Rust unit tests.
- [x] Run `cargo check`.
- [x] Exercise MCP initialize, list, preview, apply, bind, and revision conflict.
- [x] Verify no local credentials or private paths are in feature output.
- [x] Update this checklist with repository evidence.

## Verification Commands

```bash
cd app
npm test
npm run build

cd src-tauri
cargo test
cargo check

node ../mcp/devlauncher-automation-mcp.mjs --print-config
```
