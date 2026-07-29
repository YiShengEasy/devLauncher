# Requirements

## Problem

Scripts work well because the runtime owns their process, exit code, output,
timeout, and cancellation. Most other DevLauncher actions only open an app,
window, URL, or plugin WebView. Their invocation returning does not mean the
user operation completed, and they cannot pass results to later steps.

## Personas

- Developer building repeatable local routines without writing shell glue.
- Non-technical user combining screenshots, OCR, translation, and memory tools.
- Plugin author exposing a headless operation as well as an interactive window.
- Codex user asking MCP to create a valid workflow from natural language.

## Functional Requirements

### Capability Discovery

- CAP-001: Every capability has a stable ID, title, category, version, and owner.
- CAP-002: A capability declares input and output fields using a deterministic schema.
- CAP-003: A capability declares execution mode: synchronous, background, or interactive.
- CAP-004: The editor lists only capabilities available on the current platform.
- CAP-005: Existing actions are exposed through compatibility adapters.

### Inputs and Outputs

- CAP-010: A capability step stores structured input values.
- CAP-011: String inputs may reference workflow variables and previous step outputs.
- CAP-012: A successful step may return bounded structured outputs and artifacts.
- CAP-013: Later steps can reference outputs by stable step ID.
- CAP-014: Missing references fail validation or execution with a precise field path.
- CAP-015: Output values are visible in run details and copyable when not secret.

### Execution

- CAP-020: Invocation and completion are separate concepts.
- CAP-021: A dispatched action reports `dispatched`, not a false completed operation.
- CAP-022: Interactive capabilities can wait for a correlated completion event.
- CAP-023: Every wait is cancellable and bounded by a timeout.
- CAP-024: Capability errors use stable codes and human-readable messages.
- CAP-025: Existing script and project-task process execution remains unchanged.

### Control

- CAP-030: Steps support retry count and retry delay.
- CAP-031: A failed run can resume from the failed step with prior outputs restored.
- CAP-032: A workflow may invoke another workflow after cycle and depth validation.
- CAP-033: Branching and parallel groups are later extensions of the same result model.

### Plugin and MCP

- CAP-040: Plugin manifests can declare workflow capabilities separately from WebView actions.
- CAP-041: MCP can list capability schemas before generating a workflow.
- CAP-042: MCP preview validates references, permissions, and platform availability.
- CAP-043: MCP never executes a workflow as part of preview or apply.

## Non-Functional Requirements

- Existing synchronized configuration remains backward compatible.
- Output history is bounded and redacted before persistence.
- No plaintext secret is stored in a workflow definition or run history.
- Capability execution is deterministic enough for unit testing without opening UI.
- The first release retains the linear editor and does not require a graph canvas.

## Acceptance Criteria

1. Existing action-only workflows load and run without migration.
2. A capability can accept one previous output and return a typed result.
3. Invalid or unavailable capability IDs fail validation before save.
4. Clipboard read and write work without opening the clipboard window.
5. A text pipeline can pass data through at least three capability steps.
6. Run details show outputs, errors, and completion semantics.
7. MCP capability discovery matches desktop validation.
8. Frontend, Rust, MCP, and UTF-8 checks pass.

## Exclusions for This Slice

- Arbitrary graph edges and a free-form canvas.
- Unbounded loops.
- Cloud execution agents.
- Secret creation or secret value export.
- Background automation while DevLauncher is not running.
