#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATUSES = new Set(["idle", "thinking", "working", "waiting", "success", "error", "disconnected"]);

function defaultInboxPath() {
  if (process.env.DEVLAUNCHER_PET_MCP_INBOX) {
    return process.env.DEVLAUNCHER_PET_MCP_INBOX;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "com.yisheng.app", "pet-mcp-events.jsonl");
  }
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "com.yisheng.app", "pet-mcp-events.jsonl");
  }
  return path.join(os.homedir(), ".local", "share", "com.yisheng.app", "pet-mcp-events.jsonl");
}

function normalizeMessage(parts) {
  return parts.join(" ").trim().slice(0, 60);
}

function printUsage() {
  console.log("Usage: node scripts/pet-status.mjs <idle|thinking|working|waiting|success|error|disconnected> [message]");
  console.log("       node scripts/pet-status.mjs --print-config");
}

if (process.argv.includes("--print-config")) {
  console.log(JSON.stringify({ inbox: defaultInboxPath(), statuses: Array.from(STATUSES) }, null, 2));
  process.exit(0);
}

const [, , status, ...messageParts] = process.argv;
if (!STATUSES.has(status)) {
  printUsage();
  process.exit(2);
}

const message = normalizeMessage(messageParts);
const inbox = defaultInboxPath();
fs.mkdirSync(path.dirname(inbox), { recursive: true });
fs.appendFileSync(
  inbox,
  `${JSON.stringify({
    status,
    ...(message ? { message } : {}),
    createdAt: new Date().toISOString(),
    source: "devlauncher-pet-status-script",
  })}\n`,
  "utf8",
);

console.log(`pet status queued: ${status}${message ? ` / ${message}` : ""}`);
