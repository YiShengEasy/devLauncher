# Workflow Capability Engine

Status: fourth implementation slice complete; native/manual checks pending
Started: 2026-07-29
Feature slug: `workflow-capability-engine`

## Goal

Evolve DevLauncher workflows from a script-oriented sequence into a typed
capability pipeline. Built-ins and plugins must be able to accept structured
inputs, return structured outputs, report real completion, and participate in
workflows without pretending that opening a window means the work is finished.

## Compatibility

This is an additive v2 layer over the existing workflow engine:

- Existing `Action` steps continue to load and run.
- Existing keyboard bindings keep referencing only a workflow ID.
- Existing schedules, run history, cancellation, and project tasks remain.
- New capability steps use the same ordered editor and runtime status model.

## Documents

- [Requirements](01-requirements.md)
- [Product and UX](02-product-ux.md)
- [Capability Contract](03-capability-contract.md)
- [Execution and Data Model](04-execution-data-model.md)
- [Built-in Capabilities](05-builtin-capabilities.md)
- [Plugin and MCP Contract](06-plugin-mcp-contract.md)
- [Security](07-security.md)
- [Implementation Plan](08-implementation-plan.md)
- [Test Plan](09-test-plan.md)
- [Decision Log](10-decision-log.md)
- [Implementation Report](11-implementation-report.md)
- [Interactive Screenshot Requirements](12-interactive-screenshot-requirements.md)
- [Interactive Screenshot Plan](13-interactive-screenshot-plan.md)
- [OCR And Translation Requirements](14-ocr-translation-requirements.md)
- [OCR And Translation Plan](15-ocr-translation-plan.md)
- [Step Retry Requirements](16-step-retry-requirements.md)
- [Step Retry Plan](17-step-retry-plan.md)

## Implementation Sources

- TypeScript workflow model: `app/src/types/actions.ts`
- Rust workflow model: `app/src-tauri/src/types.rs`
- Workflow engine: `app/src-tauri/src/workflow.rs`
- Capability registry: `app/src-tauri/src/workflow_capabilities.rs`
- Workflow editor: `app/src/components/WorkflowPanel.tsx`
- Automation MCP: `plugins/devlauncher-automation/`
