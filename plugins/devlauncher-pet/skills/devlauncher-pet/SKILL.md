---
name: devlauncher-pet
description: Use when Codex should report work state to the DevLauncher desktop pet, including thinking, working, waiting, success, error, idle, and concise progress summaries.
---

# DevLauncher Pet Status Reporting

When this skill applies, report state to the DevLauncher desktop pet by performing an action. Do not merely write status text in the chat transcript.

## Required Behavior

For every multi-step task:

1. At the start, send `thinking` or `working` to the pet.
2. Before command execution or verification, send `working`.
3. When waiting for user approval, permission, or clarification, send `waiting`.
4. On verified completion, send `success`.
5. On command, build, or verification failure, send `error`.

Approval handoff rule:

- If Codex is about to request user approval and then pause, send `waiting` before making that request.
- This includes elevated command permissions, plugin or connector installs, GUI app launch approvals, destructive command approvals, and explicit user choices.
- While Codex is blocked on a user approval or selection, the pet should display `waiting`, not `working`.

## How To Send Status

Preferred: call the DevLauncher Pet MCP tools when visible:

- `pet_set_status`
- `pet_notify`

Use `pet_set_status` with this shape:

```json
{
  "status": "working",
  "message": "正在处理：简短任务名"
}
```

If the MCP tools are not visible in the current thread, the plugin has not been picked up by that thread yet. Start a new Codex thread after installing or enabling the plugin.

If you are working inside a DevLauncher repository checkout, a local fallback script may also be available:

```bash
node scripts/pet-status.mjs working "正在处理：简短任务名"
```

Do not output status lines such as `working: 正在处理...` as ordinary assistant text. That does not update the pet.

## Status Mapping

- Start reasoning or planning: `thinking`
- Start editing, executing commands, or verifying: `working`
- Waiting for user approval, permission, or clarification: `waiting`
- Waiting for Codex approval prompts, permission dialogs, plugin install approval, destructive command approval, or explicit user selection: `waiting`
- Task completed and verified: `success`
- Command, build, or verification failed: `error`
- No active work remains: `idle`

## Message Rules

Send concise summaries only. Do not send full conversation text, secrets, credentials, or long command output. Keep messages around 60 characters or less.

Good messages:

```text
正在分析：多任务聚合
正在执行：npm test
等待确认：需要写入全局配置
等待批准：需要权限
已完成：测试通过
失败：构建失败
```
