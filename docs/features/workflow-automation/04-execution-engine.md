# Execution Engine

## Responsibility

The workflow engine owns sequencing and completion. Existing action launch code
remains responsible for starting individual DevLauncher actions.

```text
resolve workflow
  -> validate
  -> create run
  -> for each step
       evaluate condition
       optional delay
       execute action
       await completion rule
       record result
       apply failure policy
  -> terminal run state
```

## Current Gap

`execute_action` returns after an opener or child process is spawned. This is a
launch acknowledgement, not a general completion signal. The workflow engine
must not infer readiness from that return value.

## Completion Adapters

### action_resolved

Complete after the underlying action handler returns `Ok`.

### process_started

Call the existing launcher and wait for `stabilizationMs` after it returns
successfully. This is an explicit launch-stabilization heuristic, not proof that
an arbitrary GUI process is still alive. Use `port_ready` when service readiness
can be observed.

### process_exit

Own the child handle, await exit, and validate the exit code. Used for build,
test, and one-shot scripts. Output is streamed to the workflow terminal and
retained as a bounded snapshot for late subscribers and log copying.

### port_ready

Attempt TCP connection at `intervalMs` until success, timeout, or cancellation.
Host defaults to `127.0.0.1`; non-loopback hosts are marked open-world.

### timer

Wait for duration with cancellation support.

### manual

Emit a waiting event and require explicit UI confirmation. MCP cannot silently
complete a manual step.

### window_ready, url_ready, connection_ready

These are schema-stable adapter points. The MVP validates and reports platform
support. Unsupported adapters fail clearly rather than degrading to a timer.

## Script Execution

- Use platform shell selection from existing platform helpers.
- Every workflow script runs in a managed PTY owned by the workflow engine;
  scripts never fall back to the standalone terminal action/window.
- `process_exit` keeps a managed child handle and kills it on cancellation or
  timeout.
- `process_started`, `port_ready`, and `timer` may detach a healthy managed
  child after their completion condition is satisfied.
- PTY chunks include byte offsets. The UI subscribes before reading a retained
  snapshot, so output emitted before listener registration is replayed without
  duplication.
- Never log inherited secret environment values or script content.

## Conditions

Conditions are declarative and side-effect free.

- `always`
- `previous_success`
- `previous_failed`
- `platform`
- `path_exists`
- `env_equals`

Condition errors fail the step; they do not silently evaluate false.

## Cancellation

A cancellation token is checked:

- Before every step.
- During delay and polling.
- While waiting for child exit.
- While waiting for manual confirmation.

Managed children are terminated on cancellation. Already-launched external GUI
applications are not closed automatically.

## Concurrency

- One active run per workflow by default.
- Different workflows may run concurrently.
- Mutating a workflow does not change an already-started normalized run plan.

## Events

```text
workflow-run-status
workflow-manual-confirmation-required
terminal-data-v2-{sessionId}
```

The status event carries the complete bounded run snapshot. The manual event
carries only run ID, step ID, and step name. Neither contains credentials or
script content.
