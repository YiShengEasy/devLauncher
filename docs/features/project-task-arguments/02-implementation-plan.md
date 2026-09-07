# Project Task Arguments Implementation Plan

## Phase 1: Model

- [x] Add deterministic argument parsing and validation.
- [x] Add task-scoped preset lookup, remember, remove, deduplication, and limits.
- [x] Migrate project task storage from schema version 2 to 3.

## Phase 2: Execution

- [x] Extend the Tauri command with optional parsed arguments.
- [x] Append quoted arguments to package scripts.
- [x] Revalidate Markdown task blocks before appending quoted arguments.
- [x] Keep existing workflow task resolution argument-free and compatible.

## Phase 3: Interface

- [x] Add the argument editor below command preview.
- [x] Add an original-command preview with the entered arguments appended.
- [x] Add save, choose, clear, and delete controls for presets.
- [x] Disable execution and show feedback for malformed argument input.

## Phase 4: Verification

- [x] Add frontend parser and preset tests.
- [x] Add Rust storage, quoting, and Markdown execution tests.
- [x] Run complete frontend and Rust suites.
- [x] Run production build, formatting, diff, and UTF-8 checks.
