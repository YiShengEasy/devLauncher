# Execution and Data Model

## Runtime Context

Each step receives:

```text
run ID
workflow ID
step ID
trigger
resolved inputs
prior step outputs
cancellation state
```

## Reference Syntax

Supported references:

```text
${workflow.id}
${workflow.name}
${run.id}
${steps.<step-id>.outputs.<field>}
```

References are resolved recursively in string input values. A whole-field
reference preserves the source type; embedded references stringify the value.

## Output Storage

`WorkflowStepRun` gains:

- `outputs`: bounded JSON object.
- `artifacts`: bounded artifact list.
- `attempt`: current attempt number.

Synchronized workflow configuration never contains runtime outputs. Local run
history stores redacted outputs with per-run and per-field size limits.

## Retry

`WorkflowStep` gains optional:

```text
retry.maxAttempts: 1..5
retry.delayMs: 0..300000
```

The default is one attempt. Cancellation interrupts retry delay.

## Subworkflows

Subworkflow execution is enabled only after:

- Target existence validation.
- Direct and indirect cycle detection.
- Maximum nesting depth of eight.
- Propagation of cancellation and a bounded child result summary.

It is not part of the first implementation checkpoint.

## Failure Codes

Stable initial codes:

- `CAPABILITY_NOT_FOUND`
- `CAPABILITY_UNAVAILABLE`
- `INVALID_CAPABILITY_INPUT`
- `REFERENCE_NOT_FOUND`
- `REFERENCE_TYPE_MISMATCH`
- `CAPABILITY_EXECUTION_FAILED`
- `OUTPUT_LIMIT_EXCEEDED`
- `PERMISSION_REQUIRED`
