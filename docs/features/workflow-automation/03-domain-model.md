# Domain Model

## Configuration Extension

Workflows are added to the existing synchronized `KeyboardConfig`:

```yaml
schemaVersion: 2
revision: 8
pages: []
workflows: []
theme: {}
pet: {}
```

Legacy files without these fields load with:

```text
schemaVersion = 1
revision = 0
workflows = []
```

## TypeScript Shape

```ts
type StepCondition =
  | { type: "always" }
  | { type: "previous_success" }
  | { type: "previous_failed" }
  | { type: "platform"; platform: "macos" | "windows" | "linux" }
  | { type: "path_exists"; path: string }
  | { type: "env_equals"; name: string; value: string };

type CompletionRule =
  | { type: "action_resolved" }
  | { type: "process_started"; stabilizationMs: number; timeoutMs: number }
  | { type: "process_exit"; successCodes: number[]; timeoutMs: number }
  | { type: "port_ready"; host: string; port: number; intervalMs: number; timeoutMs: number }
  | { type: "timer"; durationMs: number }
  | { type: "manual"; timeoutMs?: number }
  | { type: "window_ready"; titleContains: string; timeoutMs: number }
  | { type: "url_ready"; urlPattern: string; timeoutMs: number }
  | { type: "connection_ready"; timeoutMs: number };

interface WorkflowStep {
  id: string;
  name: string;
  enabled: boolean;
  action: Action;
  condition: StepCondition;
  completion: CompletionRule;
  delayMs: number;
  onFailure?: "stop" | "continue";
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  failurePolicy: "stop" | "continue";
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}
```

## Keyboard Binding

Add an action variant:

```ts
interface WorkflowAction {
  type: "workflow";
  name: string;
  workflowId: string;
  icon?: string;
}
```

The key stores only the stable workflow ID. It does not duplicate workflow
steps. Renaming a workflow keeps bindings valid.

## Runtime Model

```ts
type WorkflowRunStatus =
  | "pending"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled";

type StepRunStatus =
  | "pending"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";
```

Runtime state is not persisted into synchronized configuration. A bounded local
history may be added later.

## Invariants

- Workflow IDs and step IDs are non-empty and unique.
- Names are trimmed and limited to 80 characters.
- Maximum 64 steps per workflow.
- Delays and timeouts are bounded.
- Ports are between 1 and 65535.
- Environment condition names use a conservative identifier pattern.
- Script content is limited in size.
- Workflow actions cannot recursively target the current workflow.
- The MVP rejects workflow-to-workflow nesting.
- Inline password-like fields are rejected.

## Revision and Atomicity

Every mutation accepts an optional `expectedRevision`.

- Matching revision: normalize, increment, atomically save.
- Missing expected revision: allowed for in-app UI only.
- Mismatch: return a conflict with current revision and no mutation.

Atomic save writes UTF-8 YAML to a sibling temporary file and renames it over
the destination.
