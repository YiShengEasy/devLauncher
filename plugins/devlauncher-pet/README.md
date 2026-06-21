# DevLauncher Pet Codex Plugin

This Codex plugin registers local MCP tools for updating the DevLauncher desktop pet.

## Requirements

- DevLauncher is installed or running locally.
- DevLauncher settings have `入口 -> Desktop pet -> Codex 联动` enabled.
- `node` is available on PATH for the MCP server process.

## Tools

- `pet_set_status`: set `idle`, `thinking`, `working`, `waiting`, `success`, `error`, or `disconnected`.
- `pet_notify`: show a short notification and map its level to a pet status.

## Status Semantics

Use `waiting` whenever Codex is blocked on the user, including permission prompts, plugin install approval, destructive command approval, GUI launch approval, clarification, or an explicit choice. Do not keep the pet in `working` while Codex is waiting for approval.

## Install From A GitHub Checkout

Clone the DevLauncher repository, then add the repository root as a local Codex plugin marketplace:

```bash
git clone <devlauncher-github-url>
cd devLauncher
codex plugin marketplace add "$PWD"
codex plugin add devlauncher-pet@devlauncher
```

Start a new Codex thread after installation so the MCP tools and skill are loaded.

## Local Event Inbox

The bundled MCP server writes pet events to the DevLauncher app data inbox. On macOS it writes both release and development inboxes by default:

```text
~/Library/Application Support/com.yisheng.app/pet-mcp-events.jsonl
~/Library/Application Support/com.yisheng.devlauncher.dev/pet-mcp-events.jsonl
```

Override the inbox with:

```bash
DEVLAUNCHER_PET_MCP_INBOX=/absolute/path/pet-mcp-events.jsonl codex
```
