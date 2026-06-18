#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATUSES = new Set(["idle", "thinking", "working", "waiting", "success", "error", "disconnected"]);

function defaultInboxPaths() {
  if (process.env.DEVLAUNCHER_PET_MCP_INBOX) {
    return [process.env.DEVLAUNCHER_PET_MCP_INBOX];
  }
  if (process.platform === "darwin") {
    return [
      path.join(os.homedir(), "Library", "Application Support", "com.yisheng.app", "pet-mcp-events.jsonl"),
      path.join(os.homedir(), "Library", "Application Support", "com.yisheng.devlauncher.dev", "pet-mcp-events.jsonl"),
    ];
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return [path.join(base, "com.yisheng.app", "pet-mcp-events.jsonl")];
  }
  return [path.join(os.homedir(), ".local", "share", "com.yisheng.app", "pet-mcp-events.jsonl")];
}

function normalizeMessage(parts) {
  return parts.join(" ").trim().slice(0, 60);
}

function printUsage() {
  console.log("Usage: node scripts/pet-status.mjs <idle|thinking|working|waiting|success|error|disconnected> [message]");
  console.log("       node scripts/pet-status.mjs --print-config");
}

if (process.argv.includes("--print-config")) {
  console.log(JSON.stringify({ inboxes: defaultInboxPaths(), statuses: Array.from(STATUSES) }, null, 2));
  process.exit(0);
}

const [, , status, ...messageParts] = process.argv;
if (!STATUSES.has(status)) {
  printUsage();
  process.exit(2);
}

const message = normalizeMessage(messageParts);
const event = JSON.stringify({
    status,
    ...(message ? { message } : {}),
    createdAt: new Date().toISOString(),
    source: "devlauncher-pet-status-script",
  });
const inboxes = defaultInboxPaths();
for (const inbox of inboxes) {
  fs.mkdirSync(path.dirname(inbox), { recursive: true });
  fs.appendFileSync(inbox, `${event}\n`, "utf8");
}

console.log(`pet status queued: ${status}${message ? ` / ${message}` : ""} (${inboxes.length} inbox${inboxes.length === 1 ? "" : "es"})`);
