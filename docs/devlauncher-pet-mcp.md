# DevLauncher Pet MCP

DevLauncher provides a local MCP server that lets Codex update the desktop pet.

## Tools

- `pet_set_status`: set `idle`, `thinking`, `working`, `waiting`, `success`, `error`, or `disconnected`.
- `pet_notify`: show a short notification and map its level to a pet status.

## Codex Config

Add a stdio MCP server that runs:

```bash
node /Users/yisheng/Documents/SLUAN/devLauncher/mcp/devlauncher-pet-mcp.mjs
```

The server writes events to the DevLauncher app data inbox. On macOS it writes both the release and development inboxes by default:

```text
~/Library/Application Support/com.yisheng.app/pet-mcp-events.jsonl
~/Library/Application Support/com.yisheng.devlauncher.dev/pet-mcp-events.jsonl
```

You can override it:

```bash
DEVLAUNCHER_PET_MCP_INBOX=/absolute/path/pet-mcp-events.jsonl node /Users/yisheng/Documents/SLUAN/devLauncher/mcp/devlauncher-pet-mcp.mjs
```

## Usage Requirements

In DevLauncher settings, enable:

```text
入口 -> Desktop pet -> Codex 联动
```

If the switch is off, DevLauncher ignores MCP pet events.

Pet summary bubbles can be marked as read by clicking the bubble. This hides the current summary while leaving the status badge visible.

## Fallback Script

If a Codex thread has not refreshed its MCP tools yet, use the local fallback script:

```bash
node /Users/yisheng/Documents/SLUAN/devLauncher/scripts/pet-status.mjs working "正在处理：测试 MCP"
```

Supported statuses:

```text
idle thinking working waiting success error disconnected
```

The script writes to the same event inbox as the MCP server.
