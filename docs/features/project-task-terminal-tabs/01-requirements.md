# Project Task Terminal Tabs Requirements

## Goal

Make project task execution independent from an already running terminal
command. Long-running development servers must remain active while another task
starts in a separate terminal tab.

## Required Behavior

- Every click on `执行任务` creates a new terminal tab and a distinct PTY.
- The tab title uses the task name.
- Switching tabs reconnects to the stored PTY snapshot without restarting it.
- Closing a tab terminates only that tab's PTY.
- Clearing a tab removes its visible output and retained backend snapshot only.
- Clearing a tab never terminates its PTY or changes another tab's output.
- Active terminal sessions survive project-window hide/show and application
  view changes while the backend process remains alive.
- Existing one-session-per-project local storage remains readable.
- Session persistence supports multiple sessions for the same project root.
- The total persisted terminal session count remains bounded.

## Keyboard Behavior

- `Ctrl+C` continues to send the standard PTY interrupt byte through xterm.
- With selected text, `Cmd+C` keeps its normal copy behavior.
- Without selected text, `Cmd+C` does nothing and never stops the process.

## Failure Handling

- A task run resolves only after its new terminal has spawned and accepted the
  command.
- Spawn or write failures are shown in the task status and reject the pending
  task execution.
- A missing or exited session never silently accepts a command.

## Acceptance Criteria

- A long-running command in tab A does not prevent task B from starting in tab
  B.
- `Ctrl+C` interrupts a foreground process.
- Closing tab B leaves tab A running.
- Clearing tab B leaves its process running and tab A's output unchanged.
- Frontend tests, production build, Rust tests/check, formatting, diff, and
  strict UTF-8 validation pass.
