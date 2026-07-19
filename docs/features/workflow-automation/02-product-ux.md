# Product and UX Design

## Entry Point

Add a compact `Workflows` command to the main DevLauncher header beside Search
and Settings. Opening it expands the main window to a workspace capped at
`1180 x 680` and reduced further when the current display is smaller. Closing
it restores the `920 x 540` launcher window. The top workflow bar is a native
window drag region.

The selected visual target is the interactive prototype:

```text
prototypes/workflow-composer/index.html
```

Production implementation keeps the prototype's information architecture while
using existing React components, motion tokens, colors, and button styling.

## Layout

```text
+----------------+---------------------------+------------------+
| Workflow list  | Ordered steps             | Step properties  |
| search/create  | add/reorder/run status    | action/completion|
+----------------+---------------------------+------------------+
```

- Left rail: workflow search, selection, create, duplicate.
- Center: workflow name, description, failure policy, ordered step list.
- Right inspector: selected action, condition, completion, timeout, and enabled.
- Bottom: run progress and status log.

The production grid follows the prototype proportions and contracts down to
`190px / minmax(400px, 1fr) / 280px` on smaller displays. Each column scrolls
independently when vertical space is limited. No nested cards are used; only
individual workflow and step rows receive bordered surfaces.

## Main Flows

### Create Workflow

1. Select `New workflow`.
2. Enter name.
3. Add an action using the existing binding action editor.
4. Choose condition and completion rule.
5. Save.

### Bind Workflow

1. Return to the virtual keyboard.
2. Click the key to configure.
3. Open the `Workflow` menu in the standard binding dialog.
4. Select one saved and enabled workflow.
5. Save the binding. Existing key content follows the standard replacement
   behavior.

The workflow manager deliberately has no page/key selection controls.

### Run Workflow

1. Select Run or press the bound virtual key.
2. Current step becomes running.
3. The UI explains which completion signal it is waiting for.
4. Success advances to the next step.
5. Failure obeys the workflow or step policy.
6. Manual completion opens a focused confirmation dialog.

### Codex-Created Workflow

1. MCP preview creates a draft and risk summary.
2. Opening the manager reloads the current configuration revision.
3. The workflow appears in the same manager, with no separate AI-only state.

## States

- Empty: no workflows, direct create command.
- Loading: existing panel remains stable; controls disabled.
- Validation error: field-level message plus summary.
- Running: current step and workflow status remain visible while execution uses
  its immutable run snapshot.
- Waiting: the completion signal and concise waiting reason are shown.
- Manual confirmation: Continue and Stop commands.
- Success: stable green result, no celebratory full-screen treatment.
- Failure: failed step remains selected with actionable error text.
- Cancelled: pending steps are skipped and run log remains available.

## Copy Principles

- Say what signal is awaited: `Waiting for port 5173`, not `Processing`.
- Distinguish `started` from `completed`.
- Never claim an app or page is ready when only the launch command returned.
- Show scripts as code and keep long content scrollable.
- Explain unsupported platform rules before save.

## Accessibility

- All icon-only buttons have visible tooltips and accessible names.
- Step rows support keyboard selection.
- Reorder actions have Move Up and Move Down alternatives to drag and drop.
- Status is not communicated by color alone.
- Dialog focus is trapped and Escape follows the normal cancellation path.
