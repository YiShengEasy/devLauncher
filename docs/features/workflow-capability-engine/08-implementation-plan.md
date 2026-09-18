# Implementation Plan

## Phase 0: Baseline and Documentation

- [x] Confirm current branch is pushed to GitHub.
- [x] Run tracked-file secret and private-path scan.
- [x] Create the canonical feature document set.
- [x] Record final implementation evidence.

## Phase 1: Capability Foundation

- [x] Add TypeScript and Rust capability descriptor types.
- [x] Add the `capability` action variant with structured inputs.
- [x] Add a built-in capability registry and list command.
- [x] Validate capability existence, platform, and input schema.
- [x] Keep existing action workflows backward compatible.
- [x] Rename the displayed `action_resolved` meaning to `已触发`.

## Phase 2: Runtime Data Pipeline

- [x] Add step outputs and artifacts to runtime events.
- [x] Implement safe workflow reference resolution.
- [x] Execute capability steps through the registry.
- [x] Bound and redact persisted output data.
- [x] Add deterministic capability and reference unit tests.

## Phase 3: Initial Built-ins

- [x] Implement `clipboard.read_text`.
- [x] Implement `clipboard.write_text`.
- [x] Implement `text.replace`.
- [x] Implement `text.template`.
- [x] Add a built-in pipeline template.

## Phase 4: Editor

- [x] Add a Capability entry to the step binding modal.
- [x] Generate input controls from descriptors.
- [x] Add previous-output reference insertion.
- [x] Show step outputs in run details.
- [x] Keep the existing action editor unchanged.

## Phase 5: MCP

- [x] Expose capability summaries and schemas.
- [x] Validate capability actions in preview/apply.
- [x] Update MCP examples and smoke tests.

## Phase 6: Verification

- [x] Frontend tests and build.
- [x] Rust tests, format check, and check.
- [x] MCP smoke tests.
- [x] UTF-8 validation.
- [ ] Manual clipboard pipeline run.
- [x] Commit and push implementation.

The clipboard pipeline is not run automatically because doing so would replace
the user's current system clipboard; the official template and deterministic
runtime tests cover its construction and data-reference path.

## Later Phases

- [x] Interactive screenshot completion and artifact output.
- [x] OCR and translation capabilities.
- [x] Bounded, cancellable step retry controls.
- [ ] Resume failed or interrupted runs from an explicit boundary.
- [ ] Plugin capability host bridge.
- [ ] Subworkflows with cycle detection.
- [ ] Branching and parallel groups.
