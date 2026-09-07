# Workflow Step Retry Requirements

## Goal

Allow a workflow step to recover from transient failures without duplicating
the step or wrapping it in a shell loop. Retry behavior must be explicit,
bounded, cancellable, visible in the run UI, and backward compatible.

## User Stories

1. As a user, I can configure a step to attempt execution between one and five
   times.
2. As a user, I can configure a delay between failed attempts.
3. As a user, I can cancel the workflow during a retry delay.
4. As a user, I can see the current attempt in step status, terminal output,
   copied logs, and run history.
5. As a user, cancelling an interactive step does not reopen it as a retry.

## Data Contract

`WorkflowStep` gains an optional retry policy:

```json
{
  "retry": {
    "maxAttempts": 3,
    "delayMs": 1000
  }
}
```

- `maxAttempts`: integer from 1 to 5, including the first execution.
- `delayMs`: integer from 0 to 300000.
- Missing `retry` means one attempt and no delay.

`WorkflowStepRun` gains:

- `attempt`: current or final one-based attempt number; zero before execution.

## Runtime Rules

- The execution condition and `delayMs` run once before the first attempt.
- Retry applies only to execution failures.
- Workflow cancellation and explicit interactive cancellation never retry.
- A retry delay uses the existing cancellable sleep primitive.
- A failed intermediate attempt does not activate `previous_failed`; only the
  final step result participates in later conditions.
- The step-level or workflow-level failure policy is evaluated only after all
  configured attempts fail.
- Each script attempt receives a distinct terminal session while the workflow
  terminal keeps already displayed output.
- Successful structured outputs and artifacts come only from the successful
  attempt.

## Compatibility And Security

- Existing serialized workflows load without migration.
- Existing official templates remain unchanged unless they explicitly declare
  a retry policy.
- Run history keeps the attempt number but continues to remove command output,
  structured outputs, artifact paths, and terminal session IDs.
- Retry cannot exceed five attempts or five minutes between attempts.

## Acceptance Criteria

- Rust validation rejects out-of-range policies.
- The editor exposes attempt count and delay without crowding the main step
  list.
- Runtime events show retry waiting and the next attempt.
- Cancellation during delay finishes the run as cancelled.
- Rust, frontend, build, MCP, formatting, and UTF-8 checks pass.
