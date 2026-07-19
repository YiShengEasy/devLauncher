#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const child = spawn("node", ["mcp/devlauncher-automation-mcp.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    DEVLAUNCHER_CONFIG_PATH: process.env.DEVLAUNCHER_CONFIG_PATH,
  },
  stdio: ["pipe", "pipe", "inherit"],
});

let input = Buffer.alloc(0);
const pending = new Map();

function send(id, method, params = {}) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP timeout: ${method}`)), 30000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
}

function consume() {
  while (true) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = input.subarray(0, headerEnd).toString("utf8");
    const match = header.match(/content-length:\s*(\d+)/i);
    if (!match) throw new Error("Missing Content-Length");
    const length = Number(match[1]);
    const start = headerEnd + 4;
    const end = start + length;
    if (input.length < end) return;
    const message = JSON.parse(input.subarray(start, end).toString("utf8"));
    input = input.subarray(end);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  }
}

child.stdout.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  consume();
});

try {
  const initialized = await send(1, "initialize", { protocolVersion: "2024-11-05" });
  if (initialized.result?.serverInfo?.name !== "devlauncher-automation-mcp") {
    throw new Error("Unexpected MCP server info");
  }

  const listed = await send(2, "tools/list");
  const names = listed.result?.tools?.map((tool) => tool.name) ?? [];
  if (!names.includes("devlauncher_preview_workflow") || !names.includes("devlauncher_apply_workflow")) {
    throw new Error("Required workflow tools are missing");
  }

  const previewed = await send(3, "tools/call", {
    name: "devlauncher_preview_workflow",
    arguments: {
      workflow: {
        name: "MCP protocol test",
        steps: [{
          name: "Wait",
          action: { type: "script", name: "Wait", shell: "terminal", content: "exit 0" },
        }],
      },
    },
  });
  if (previewed.result?.structuredContent?.ok !== true) {
    throw new Error("Workflow preview failed");
  }
  process.stdout.write("automation MCP protocol test passed\n");
} finally {
  child.kill();
}
