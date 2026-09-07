# Interactive Screenshot Implementation Plan

## Phase 1: Contract And State

- [x] Add `screenshot.capture` to the Rust-owned capability registry.
- [x] Extend artifact metadata with an optional local path.
- [x] Add one managed pending-request state with explicit complete, cancel, and
      release operations.
- [x] Keep base64 image data out of workflow outputs and history.

## Phase 2: Overlay Bridge

- [x] Expose commands for reading the active request, completing it with PNG
      bytes, and cancelling it.
- [x] Connect screenshot confirm/save/cancel actions to the active request.
- [x] Use a user-selected save destination as the artifact path without writing
      a duplicate managed copy.
- [x] Preserve normal screenshot behavior when no workflow request is active.

## Phase 3: Workflow Runtime

- [x] Execute interactive capabilities asynchronously.
- [x] Mark interactive capability steps as waiting.
- [x] Propagate workflow cancellation and timeout to the screenshot request.
- [x] Return structured outputs and one file artifact only after confirmation.

## Phase 4: Product Surface

- [x] Show local artifact paths in workflow run details.
- [x] Add an official screenshot workflow template.
- [x] Keep capability controls descriptor-driven.

## Phase 5: Verification

- [ ] Add Rust tests for descriptors, defaults, request completion, busy state,
      cancellation, timeout, and artifact path construction.
- [x] Add frontend tests for screenshot workflow request helpers.
- [x] Run frontend tests and production build.
- [x] Run Rust tests, format check, and check.
- [x] Run MCP smoke tests.
- [ ] Manually confirm capture and Esc cancellation in the desktop app.

## Verification Note

The isolated Debug apps loaded the test workflow, opened the screenshot overlay,
and Esc returned to the pet window. macOS denied image capture because each
temporary app bundle lacked its own Screen Recording grant, so the successful
PNG confirmation path remains a manual gate. No production or development
configuration was replaced; temporary test configuration was removed.
