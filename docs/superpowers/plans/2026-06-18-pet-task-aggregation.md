# Pet Task Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DevLauncher desktop pet aggregate multiple concurrent Codex task reports instead of showing only the latest event.

**Architecture:** Extend the pet MCP/status payload from a single global status into task-aware events with `taskId`, `taskTitle`, `status`, `message`, and timestamps. Keep the current single-event behavior as a compatibility fallback when no `taskId` is provided. Aggregate active tasks in the pet frontend with a small pure reducer, then render one global status badge plus one dismissible summary bubble.

**Tech Stack:** React, TypeScript, Vitest, Node MCP stdio server, Tauri Rust event inbox.

---

## Aggregation Rules

### Task Event Shape

Each MCP event may include task identity:

```ts
export type PetCodexStatus =
  | "idle"
  | "working"
  | "waiting"
  | "success"
  | "error"
  | "disconnected";

export type PetTaskStatusEvent = {
  taskId?: string;
  taskTitle?: string;
  status: PetCodexStatus;
  message?: string;
  createdAt?: string;
};
```

Compatibility rule:

- If `taskId` is missing, treat the event as the existing global status event.
- If `taskId` exists, update that task in the local task map.

### Active Task Lifetime

Keep task records in memory in `PetEntryApp`.

Terminal statuses:

- `success`
- `error`
- `idle`

Retention:

- `success`: keep for 8 seconds so the user can see completion.
- `error`: keep until a newer event for the same `taskId`, or until the user dismisses the summary.
- `idle`: remove the task immediately.
- `working` and `waiting`: keep until replaced by another status for the same `taskId`.

This avoids stale completed tasks making the pet look busy forever.

### Aggregated Status Priority

Compute the visible pet status with this priority:

```text
error > waiting > working > success > disconnected > idle
```

Detailed rules:

- If any active task is `error`, aggregate status is `error`.
- Else if any active task is `waiting`, aggregate status is `waiting`.
- Else if any active task is `working`, aggregate status is `working`.
- Else if any recently completed task is `success`, aggregate status is `success`.
- Else if Codex linkage is enabled but no task events have been received, aggregate status is `disconnected`.
- Else aggregate status is `idle`.

Examples:

```text
A working + B waiting => waiting
A success + B working => working
A error + B working => error
A success + B success => success
no tasks + linkage enabled + no event => disconnected
no tasks + at least one prior event => idle
```

## Display Rules

### Status Badge

The small status badge remains always visible when Codex linkage is enabled.

Badge label by aggregate status:

```text
idle         空闲
working      执行中
waiting      等待确认
success      已完成
error        失败
disconnected 未连接
```

When multiple tasks exist, append a count:

```text
执行中 2
等待确认 1
失败 1
```

Count means the number of tasks currently matching the aggregate status. If status is `working` and there are 3 working tasks, show `执行中 3`. If status is `error` and there is 1 failed task plus 2 working tasks, show `失败 1`.

### Summary Bubble

The summary bubble is dismissible, as currently implemented.

Message selection order:

1. Most recent `error` task message.
2. Most recent `waiting` task message.
3. If more than one task is working: `N 个任务执行中`.
4. Most recent `working` task message.
5. Most recent `success` task message.
6. No bubble for `idle` or `disconnected` unless the event explicitly includes a message.

Message format:

```text
<taskTitle>: <message>
```

If `taskTitle` is missing, use only `message`.

Length:

- Keep the normalized summary at 60 characters or less.
- The pet bubble may wrap within its `180px` width.

### Dismiss Behavior

Dismissing the bubble marks only the current aggregate summary as read.

Rules:

- Clicking the bubble hides the current summary.
- A new event for any task creates a new summary key and shows the bubble again.
- Dismissing an `error` summary does not clear the underlying task status. The badge still shows `失败`.
- If all error tasks are resolved, the aggregate status recomputes normally.

## MCP Tool Changes

Keep existing tools and add optional task fields.

### pet_set_status

Input:

```json
{
  "status": "working",
  "message": "正在跑测试",
  "taskId": "repo-test",
  "taskTitle": "测试"
}
```

Backward compatibility:

```json
{
  "status": "working",
  "message": "正在跑测试"
}
```

still works as the global status.

### pet_notify

Input:

```json
{
  "message": "测试通过",
  "level": "success",
  "taskId": "repo-test",
  "taskTitle": "测试"
}
```

`level` maps to status exactly as today:

```text
info    -> working
success -> success
warning -> waiting
error   -> error
```

## Files

- Modify: `mcp/devlauncher-pet-mcp.mjs`
  - Add optional `taskId` and `taskTitle` schema fields.
  - Include normalized task fields in JSONL events.
- Modify: `scripts/pet-status.mjs`
  - Add optional `--task-id` and `--task-title` flags.
  - Preserve current positional usage.
- Modify: `app/src/entry/petCodexStatus.ts`
  - Add task event and aggregate result types.
  - Add pure aggregation helpers.
- Modify: `app/src/entry/petCodexStatus.test.ts`
  - Add reducer tests for priority, counts, retention, and summaries.
- Modify: `app/src/entry/PetEntryApp.tsx`
  - Store task map and aggregate display state.
  - Render badge count and aggregate summary.
- Modify: `app/src-tauri/src/entries.rs`
  - Allow `task_id`, `taskId`, `task_title`, and `taskTitle` aliases in event payloads.
  - Continue validating status and truncating messages.
- Modify: `docs/devlauncher-pet-mcp.md`
  - Document task-aware usage examples.

---

### Task 1: Add Task-Aware Types And Aggregator Tests

**Files:**
- Modify: `app/src/entry/petCodexStatus.ts`
- Modify: `app/src/entry/petCodexStatus.test.ts`

- [ ] **Step 1: Add failing tests for priority**

Add tests that verify:

```ts
expect(aggregatePetTasks([
  { taskId: "a", taskTitle: "A", status: "working", message: "改代码" },
  { taskId: "b", taskTitle: "B", status: "waiting", message: "等确认" },
])).toMatchObject({
  status: "waiting",
  statusCount: 1,
  summary: "B: 等确认",
});
```

- [ ] **Step 2: Add failing tests for error priority**

Add tests that verify:

```ts
expect(aggregatePetTasks([
  { taskId: "a", taskTitle: "A", status: "working", message: "改代码" },
  { taskId: "b", taskTitle: "B", status: "error", message: "测试失败" },
])).toMatchObject({
  status: "error",
  statusCount: 1,
  summary: "B: 测试失败",
});
```

- [ ] **Step 3: Add failing tests for multiple working summary**

Add tests that verify:

```ts
expect(aggregatePetTasks([
  { taskId: "a", status: "working", message: "改 UI" },
  { taskId: "b", status: "working", message: "跑测试" },
])).toMatchObject({
  status: "working",
  statusCount: 2,
  summary: "2 个任务执行中",
});
```

- [ ] **Step 4: Implement aggregator helpers**

Implement these exports:

```ts
export type PetTaskStatusEvent = PetCodexStatusPayload & {
  taskId?: string;
  taskTitle?: string;
  createdAt?: string;
};

export type PetTaskAggregate = {
  status: PetCodexStatus;
  statusCount: number;
  summary?: string;
};

export function aggregatePetTasks(events: PetTaskStatusEvent[]): PetTaskAggregate;
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/entry/petCodexStatus.test.ts
```

Expected: tests pass.

### Task 2: Add Task Fields To MCP And Script Events

**Files:**
- Modify: `mcp/devlauncher-pet-mcp.mjs`
- Modify: `scripts/pet-status.mjs`
- Modify: `docs/devlauncher-pet-mcp.md`

- [ ] **Step 1: Update MCP schemas**

Add optional `taskId` and `taskTitle` to both `pet_set_status` and `pet_notify`.

- [ ] **Step 2: Normalize task fields**

Add helpers:

```js
function normalizeTaskId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function normalizeTaskTitle(value) {
  return typeof value === "string" ? value.trim().slice(0, 30) : "";
}
```

Include fields only when non-empty.

- [ ] **Step 3: Add script flags**

Support:

```bash
node scripts/pet-status.mjs working "正在跑测试" --task-id repo-test --task-title 测试
```

Also keep this working:

```bash
node scripts/pet-status.mjs working "正在跑测试"
```

- [ ] **Step 4: Smoke test event output**

Run:

```bash
DEVLAUNCHER_PET_MCP_INBOX=/private/tmp/pet-task-test.jsonl node scripts/pet-status.mjs working "正在跑测试" --task-id repo-test --task-title 测试
cat /private/tmp/pet-task-test.jsonl
```

Expected: JSONL contains `taskId`, `taskTitle`, `status`, and `message`.

### Task 3: Accept Task Fields In Tauri Inbox

**Files:**
- Modify: `app/src-tauri/src/entries.rs`

- [ ] **Step 1: Extend payload struct**

Change `PetCodexStatusPayload` to include:

```rust
#[serde(rename = "taskId", alias = "task_id", skip_serializing_if = "Option::is_none")]
pub task_id: Option<String>,
#[serde(rename = "taskTitle", alias = "task_title", skip_serializing_if = "Option::is_none")]
pub task_title: Option<String>,
```

- [ ] **Step 2: Normalize task fields**

Trim `task_id` to 80 chars and `task_title` to 30 chars. Keep current message truncation at 60 chars.

- [ ] **Step 3: Keep global events compatible**

Events without `taskId` must still deserialize and emit as they do today.

### Task 4: Render Aggregate In PetEntryApp

**Files:**
- Modify: `app/src/entry/PetEntryApp.tsx`

- [ ] **Step 1: Add task event state**

Add state:

```ts
const [codexTaskEvents, setCodexTaskEvents] = useState<PetTaskStatusEvent[]>([]);
```

- [ ] **Step 2: Route task events**

When an event has `taskId`, append it to `codexTaskEvents`. When it has no `taskId`, keep using the existing global `codexStatus`.

- [ ] **Step 3: Compute display state**

Use `aggregatePetTasks(codexTaskEvents)` when task events exist. Otherwise use current `codexStatus`.

- [ ] **Step 4: Render count in badge**

If `statusCount > 1`, render:

```text
执行中 2
```

If `statusCount` is `1`, render the current label only.

- [ ] **Step 5: Keep dismiss behavior**

Summary key must include aggregate status and summary:

```ts
const codexMessageKey = displaySummary ? `${displayStatus}:${displaySummary}` : "";
```

### Task 5: Verify

**Commands:**

```bash
npm test
npm run build
cargo check
```

Expected:

- `npm test` passes.
- `npm run build` passes.
- `cargo check` may still be blocked by local `rustc 1.87.0` because current dependencies require `rustc 1.88+`; if so, report that exact blocker.

## Self-Review

- Spec coverage: This plan defines aggregation state, display state, MCP inputs, script fallback, Tauri payload handling, and verification.
- Placeholder scan: No implementation step relies on TBD behavior.
- Type consistency: `taskId`, `taskTitle`, `status`, `message`, and `createdAt` are used consistently across TypeScript, MCP JSON, script output, and Rust aliases.
