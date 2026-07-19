---
name: devlauncher-automation
description: Use when Codex should inspect, design, validate, create, update, delete, or bind DevLauncher workflows through the DevLauncher Automation MCP tools.
---

# DevLauncher Automation

Use the MCP tools instead of editing `keyboard.yaml` directly.

For creation or updates:

1. Call `devlauncher_get_capabilities`.
2. Call `devlauncher_list_workflows` and retain the returned revision.
3. Call `devlauncher_preview_workflow` with the complete draft.
4. Explain validation errors or high-risk findings before mutation.
5. Call `devlauncher_apply_workflow` with the exact previewed workflow and current revision.
6. If requested, call `devlauncher_bind_workflow` using the revision returned by apply.

Use stable workflow and step IDs when updating. Never put passwords, tokens,
cookies, private key bodies, or authorization headers in a workflow. Store
credentials in the operating system credential store.

Completion rules are explicit:

- `action_resolved`: the launcher action returned successfully.
- `process_started`: the launched app remained alive for the stabilization period.
- `process_exit`: a managed script exited with an allowed code.
- `port_ready`: a TCP connection succeeded before timeout.
- `timer`: the configured duration elapsed.
- `manual`: DevLauncher waits for the user to confirm.

An apply operation saves configuration but never executes the workflow.
