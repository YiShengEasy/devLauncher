# Project Task Terminal Tabs Implementation Plan

## Phase 1: Session Model

- [x] Store multiple session IDs for one project root.
- [x] Persist an optional human-readable tab title.
- [x] Preserve backward compatibility with existing stored sessions.
- [x] Add deterministic session parsing, lookup, upsert, and removal tests.

## Phase 2: Terminal Tabs

- [x] Create a fresh session for every task execution.
- [x] Add tab switching, new-tab, and close-tab controls.
- [x] Rehydrate active sessions from backend snapshots.
- [x] Keep hidden terminal sessions alive when another tab is selected.
- [x] Reject pending task execution when session startup fails.

## Phase 3: Interrupt Handling

- [x] Preserve native xterm `Ctrl+C` behavior.
- [x] Ignore macOS `Cmd+C` when no terminal text is selected.
- [x] Preserve `Cmd+C` copy when terminal text is selected.
- [x] Add shortcut decision unit tests.

## Phase 4: Verification

- [x] Add backend snapshot clearing scoped to the selected terminal session.
- [x] Reset the selected xterm view and stream offset after backend confirmation.
- [x] Add regression tests proving other terminal snapshots remain unchanged.

- [x] Run focused and complete frontend tests.
- [x] Run frontend production build.
- [x] Run Rust tests and all-target check.
- [x] Run formatting, diff, and strict UTF-8 checks.
