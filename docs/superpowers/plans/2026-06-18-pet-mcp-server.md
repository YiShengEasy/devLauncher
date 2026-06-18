# Pet MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Codex call DevLauncher desktop pet tools through a local MCP server.

**Architecture:** Add a dependency-free Node stdio MCP server that appends JSONL events to the DevLauncher app data directory. Add a Tauri command for the pet window to consume those events only when Codex linkage is enabled.

**Tech Stack:** Node.js stdio, MCP JSON-RPC protocol, Tauri Rust commands, React polling.

---

### Task 1: Add MCP Server

**Files:**
- Create: `mcp/devlauncher-pet-mcp.mjs`
- Create: `docs/devlauncher-pet-mcp.md`

- [x] Implement `initialize`, `tools/list`, and `tools/call`.
- [x] Implement `pet_set_status`.
- [x] Implement `pet_notify`.
- [x] Document Codex MCP config snippet.

### Task 2: Add Tauri Event Inbox Consumer

**Files:**
- Modify: `app/src-tauri/src/entries.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [x] Add app-data inbox path helper.
- [x] Add `take_pet_mcp_events` command.
- [x] Keep config toggle as the safety gate.

### Task 3: Connect Pet Window

**Files:**
- Modify: `app/src/entry/PetEntryApp.tsx`

- [x] Poll `take_pet_mcp_events` while Codex linkage is enabled.
- [x] Normalize payloads through existing status code.
- [x] Preserve disabled behavior.

### Task 4: Verify

**Commands:**
- `node mcp/devlauncher-pet-mcp.mjs --print-config`
- `npm test` from `app`
- `npm run build` from `app`
- `cargo check` from `app/src-tauri`

- [x] Run MCP server smoke check.
- [x] Run frontend tests.
- [x] Run frontend build.
- [x] Report Rust toolchain blocker if still present: `cargo check` is blocked by local `rustc 1.87.0`; current dependencies require `rustc 1.88+`.
