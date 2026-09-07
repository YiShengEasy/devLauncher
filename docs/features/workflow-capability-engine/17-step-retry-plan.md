# Workflow Step Retry Implementation Plan

## Phase 1: Model And Validation

- [x] Add an optional retry policy to TypeScript and Rust workflow steps.
- [x] Add an attempt number to runtime step state.
- [x] Validate attempts and delay against bounded limits.
- [x] Preserve old workflow and run-history compatibility.

## Phase 2: Runtime

- [x] Execute the step inside a bounded attempt loop.
- [x] Keep condition and pre-step delay outside the retry loop.
- [x] Make retry delay cancellable.
- [x] Skip retry for workflow and interactive cancellation.
- [x] Use a distinct managed terminal session for each attempt.

## Phase 3: Product Surface

- [x] Add retry controls to step properties.
- [x] Show attempt numbers in live status, terminal, and copied logs.
- [x] Preserve retry policy when copying steps and importing templates.

## Phase 4: Verification

- [x] Add validation, compatibility, cancellation, and retry decision unit
      tests.
- [x] Add frontend model, template, and clipboard tests.
- [x] Run complete Rust and frontend test suites.
- [x] Run frontend production build and Cargo all-target check.
- [x] Run MCP smoke, format check, diff check, and strict UTF-8 validation.

## Deferred: Resume

Retry operates inside one active run. Restarting a failed or interrupted run
from a selected boundary is a separate feature because it requires an immutable
workflow snapshot, stale-definition handling, and explicit reuse rules for
prior outputs and artifacts.
