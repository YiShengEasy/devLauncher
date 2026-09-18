# Multiple Workflow Terminal Sessions

## Requirements

- Retain live output from earlier steps while later steps execute.
- Keep collecting output after workflow completion for persistent services.
- Stop all terminal sessions belonging to the selected workflow run.
- Route manual input and Ctrl+C to the selected running step.

## Implementation

- The terminal subscribes to every session recorded in the current run, with independent byte offsets and snapshot recovery.
- Output is appended to the shared terminal buffer. The input selector does not switch output subscriptions.
- Workflow cancellation closes all registered PTYs with this run's session prefix, including retry sessions, and records cancellation for the execution engine.
- Closing terminals after completion uses the same backend operation.

## Verification

- Production frontend build and Rust all-target check passed.
- Twelve frontend API and terminal tests passed.
- A real PTY regression test verified that two sessions from one run are removed while another run remains active.
- Native-window interaction has not been manually verified. The installed app requires a rebuilt backend to use this change.

## Boundary

The stop operation manages registered workflow terminal sessions. Independently detached processes or services launched through an external supervisor require their own service shutdown command.
