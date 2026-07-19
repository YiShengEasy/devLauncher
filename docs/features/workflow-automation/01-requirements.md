# Requirements

## Problem

DevLauncher can launch individual actions from virtual keyboard keys, but a
real development routine commonly requires several ordered operations:

- Open an editor and project.
- Run a script.
- Wait for a service to become ready.
- Open a URL or connect over SSH.
- Stop, continue, or ask the user when a step fails.

Users should not need to hand-edit YAML to build this sequence. Codex should be
able to translate a natural-language request into a safe, reviewable workflow.

## Personas

- Individual developer: wants one key to start a repeatable local routine.
- Cross-platform user: expects the same workflow definition to degrade safely
  across macOS and Windows.
- Codex user: describes intent in prose and expects structured configuration.
- Plugin author: exposes actions that can participate in workflows.

## Primary Use Cases

### UC-1 Create in UI

The user creates a workflow, adds ordered actions, chooses completion rules,
saves it, and runs it.

### UC-2 Bind to Keyboard

The user clicks a virtual keyboard key, opens the standard binding dialog,
chooses the `Workflow` menu, and selects a saved workflow. Pressing that key
runs the selected workflow. The workflow editor does not contain a separate
page/key picker.

### UC-3 Create with Codex

The user says:

> Create a workflow that opens the project, runs the dev server, waits for port
> 5173, and opens the browser. Stop if the script fails.

Codex discovers supported actions, previews a normalized definition, and only
applies it after the host approval flow.

### UC-4 Observe and Cancel

The user sees pending, running, succeeded, failed, skipped, waiting, and
cancelled states. A running workflow can be cancelled.

### UC-5 Sync

Workflows and keyboard bindings are included in the existing configuration
snapshot. Credentials remain in the local OS credential store.

## Functional Requirements

### Workflow Management

- FR-001: Create, rename, duplicate, enable, disable, and delete workflows.
- FR-002: A workflow has a stable ID independent of its display name.
- FR-003: Reorder steps without changing step IDs.
- FR-004: Validate names, action payloads, conditions, completion rules, and
  timeout bounds before save.
- FR-005: Save configuration atomically.

### Steps

- FR-010: Reuse existing action types: app, folder, file, URL, SSH, script,
  system, builtin, and plugin.
- FR-011: Each step has an enable flag and optional execution delay.
- FR-012: Each step has a run condition.
- FR-013: Each step has a completion rule.
- FR-014: Each step has an on-failure policy: stop or continue.
- FR-015: Disabled or condition-false steps are marked skipped.

### Conditions

- FR-020: Always run.
- FR-021: Run after previous success.
- FR-022: Run after previous failure.
- FR-023: Run only on a selected OS.
- FR-024: Run when a file or directory exists.
- FR-025: Run when an environment variable equals a configured value.
- FR-026: Conditions must not execute arbitrary code.

### Completion

- FR-030: Complete when action invocation returns.
- FR-031: Complete when the launch handler succeeds and the configured
  stabilization interval elapses. Verifying an arbitrary GUI child remains
  alive requires a future platform process adapter.
- FR-032: Complete when a script exits with an accepted code.
- FR-033: Complete when a TCP port becomes reachable.
- FR-034: Complete after a timer.
- FR-035: Complete after explicit user confirmation.
- FR-036: Model window-ready, URL-ready, and SSH-connected rules even when a
  platform adapter is not yet available; unsupported rules fail validation
  instead of silently pretending success.
- FR-037: Every automated completion rule has a timeout.

### Execution

- FR-040: Only one run of the same workflow may be active by default.
- FR-041: A run has a stable run ID and ordered step results.
- FR-042: Cancellation stops pending work and terminates managed child processes.
- FR-043: Execution emits status updates to the UI.
- FR-044: The MVP does not capture process output. A future output adapter must
  bound and redact output before exposing it.

### MCP

- FR-050: Read capabilities and existing workflows.
- FR-051: Preview changes without mutation.
- FR-052: Apply a validated workflow with optimistic revision checking.
- FR-053: Bind or unbind a workflow key.
- FR-054: Run and cancel a workflow separately from configuration mutation in
  the desktop runtime. Exposing these controls through MCP is a later bridge.
- FR-055: Return structured JSON results in addition to concise text.
- FR-056: Mark tools with appropriate MCP annotations, while enforcing safety
  independently in server code.

## Non-Functional Requirements

- NFR-001: Existing keyboard configuration loads without migration failure.
- NFR-002: New fields use serde/default normalization for backward compatibility.
- NFR-003: MCP remains local by default and uses stdio transport.
- NFR-004: No password, token, or private key content is persisted in workflows.
- NFR-005: UI remains usable at the current 900px main-window width.
- NFR-006: Windows and macOS use one persisted schema.
- NFR-007: A malformed MCP request cannot corrupt the configuration.

## Acceptance Criteria

1. A user can create a two-step workflow and bind it to a key.
2. Pressing the key invokes the workflow command rather than a raw action.
3. A script step can wait for exit code or a later port-ready condition.
4. Cancelling a run produces a cancelled terminal state.
5. Codex can preview and apply the same workflow through MCP.
6. MCP cannot save inline credentials or run a script as part of preview.
7. Existing tests, frontend build, and Rust checks pass.

## Exclusions

- Visual node graph with arbitrary edges.
- Cron or cloud scheduling.
- Shared multi-user workflow editing.
- Unattended remote execution.
- Secret creation through MCP.
- Full shell expression language for conditions.
