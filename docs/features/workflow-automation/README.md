# Workflow Automation

Status: MVP implemented
Started: 2026-07-18
Completed: 2026-07-18
Extended: 2026-07-20 (single-step runs, interval and daily scheduling)
Feature slug: `workflow-automation`

## Goal

Let users compose reliable multi-step workflows, bind them to the virtual
keyboard, and let Codex create or update them through a local MCP server.

## Source Material

- Interactive prototype:
  `prototypes/workflow-composer/index.html`
- Existing action model:
  `app/src/types/actions.ts`
- Existing Rust action execution:
  `app/src-tauri/src/actions.rs`
- Existing local MCP implementation:
  `mcp/devlauncher-pet-mcp.mjs`
- Workflow manager:
  `app/src/components/WorkflowPanel.tsx`
- Workflow engine:
  `app/src-tauri/src/workflow.rs`
- Shared configuration CLI:
  `app/src-tauri/src/bin/devlauncherctl.rs`
- Automation MCP:
  `plugins/devlauncher-automation/`

## Documents

- [Requirements](01-requirements.md)
- [Product and UX](02-product-ux.md)
- [Domain Model](03-domain-model.md)
- [Execution Engine](04-execution-engine.md)
- [MCP Contract](05-mcp-contract.md)
- [Security](06-security.md)
- [Implementation Plan](07-implementation-plan.md)
- [Test Plan](08-test-plan.md)
- [Decision Log](09-decision-log.md)
- [Implementation Report](10-implementation-report.md)

## MVP Boundary

The first production slice includes:

- Persisted workflows in the existing synchronized application configuration.
- Ordered steps using existing DevLauncher action types.
- Step enablement, conditions, completion rules, timeout, and failure policy.
- A workflow manager using the existing DevLauncher visual language.
- Binding a workflow to a virtual keyboard key.
- Running and cancelling workflows with visible status.
- Running one selected step independently through the same status and cancellation pipeline.
- Starting enabled workflows on a persisted minute interval or daily local time
  while DevLauncher is running, with an “自启动” marker in the workflow list.
- A local MCP server with capability, read, preview, apply, bind, delete, and
  unbind tools.
- Dry-run validation and deterministic safety checks before mutation or execution.

Advanced branching graphs, general calendar/cron expressions, cloud-triggered execution, and arbitrary
remote agents are outside the MVP. MCP-triggered run, cancellation, and run
status are a later bridge; workflows run from the desktop UI or virtual keyboard
in this release.
