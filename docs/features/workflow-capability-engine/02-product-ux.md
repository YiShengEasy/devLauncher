# Product and UX

## Editor Model

Keep the current three-column workflow editor. Add a step source selector:

- Action: existing app, folder, URL, script, system, built-in window, or plugin window.
- Capability: a typed operation that can produce data.
- Control: reserved for conditions, retry, approval, and later branching.

The step property panel is generated from the capability schema. Text fields,
selects, toggles, and numeric controls use the existing visual language.

## Completion Copy

The UI must distinguish:

- `已触发`: the action was dispatched successfully.
- `已完成`: the capability returned a successful result.
- `等待交互`: the capability is waiting for a user event.
- `等待条件`: the engine is polling a declared completion adapter.

The old `动作返回` label becomes `已触发` without changing its persisted value.

## Data References

String inputs support an insertion menu rather than requiring memorized syntax.
The menu groups:

- Workflow variables.
- Previous step outputs.
- Built-in run metadata.

Rendered references appear as compact tokens while the persisted value remains
plain UTF-8 text such as `${steps.ocr.outputs.text}`.

## Run Details

Each completed step may show:

- Status and duration.
- Short message.
- Output field names and values.
- Artifact links such as an image path.
- Retry attempt count.

Secret or redacted outputs show only their field name and protection state.

## Error Recovery

When a step fails:

- `重试此步骤` reruns the failed step with the same resolved inputs.
- `从此处继续` restores prior outputs and continues from the selected step.
- `复制错误` keeps the existing full diagnostic behavior.

## Accessibility

- All generated controls have labels.
- Capability cards are keyboard selectable.
- Status is expressed through text in addition to color.
- Reduced-motion preferences apply to capability list and result transitions.
