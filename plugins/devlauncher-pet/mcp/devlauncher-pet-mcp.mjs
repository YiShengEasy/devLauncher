#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATUSES = new Set(["idle", "thinking", "working", "waiting", "success", "error", "disconnected"]);
const LEVEL_TO_STATUS = {
  info: "working",
  success: "success",
  warning: "waiting",
  error: "error",
};

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

function normalizeMessage(value) {
  return typeof value === "string" ? value.trim().slice(0, 60) : "";
}

function appendPetEvent(event) {
  const inboxes = defaultInboxPaths();
  const line = `${JSON.stringify({ ...event, createdAt: new Date().toISOString() })}\n`;
  for (const inbox of inboxes) {
    fs.mkdirSync(path.dirname(inbox), { recursive: true });
    fs.appendFileSync(inbox, line, "utf8");
  }
  return inboxes;
}

function contentText(text) {
  return [{ type: "text", text }];
}

function toolResult(text) {
  return { content: contentText(text) };
}

function errorResult(text) {
  return { isError: true, content: contentText(text) };
}

const tools = [
  {
    name: "pet_set_status",
    description: "Set the DevLauncher desktop pet Codex status.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: Array.from(STATUSES),
          description: "Pet status to display.",
        },
        message: {
          type: "string",
          description: "Optional short message shown near the pet.",
        },
      },
      required: ["status"],
      additionalProperties: false,
    },
  },
  {
    name: "pet_notify",
    description: "Show a short notification on the DevLauncher desktop pet.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Short message shown near the pet.",
        },
        level: {
          type: "string",
          enum: ["info", "success", "warning", "error"],
          description: "Notification level.",
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
];

function handleToolCall(params = {}) {
  const name = params.name;
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};

  if (name === "pet_set_status") {
    if (!STATUSES.has(args.status)) {
      return errorResult("Invalid status.");
    }
    const message = normalizeMessage(args.message);
    const inboxes = appendPetEvent({
      status: args.status,
      ...(message ? { message } : {}),
    });
    return toolResult(`Pet status queued: ${args.status} (${inboxes.join(", ")})`);
  }

  if (name === "pet_notify") {
    const message = normalizeMessage(args.message);
    if (!message) {
      return errorResult("Message is required.");
    }
    const level = typeof args.level === "string" && LEVEL_TO_STATUS[args.level] ? args.level : "info";
    const status = LEVEL_TO_STATUS[level];
    const inboxes = appendPetEvent({ status, message });
    return toolResult(`Pet notification queued: ${level} (${inboxes.join(", ")})`);
  }

  return errorResult(`Unknown tool: ${name}`);
}

function handleRequest(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: request.params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "devlauncher-pet-mcp", version: "0.1.0" },
    };
  }
  if (request.method === "tools/list") {
    return { tools };
  }
  if (request.method === "tools/call") {
    return handleToolCall(request.params);
  }
  return null;
}

let input = Buffer.alloc(0);

function sendMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function consumeInput() {
  while (true) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const header = input.subarray(0, headerEnd).toString("utf8");
    const match = header.match(/content-length:\s*(\d+)/i);
    if (!match) {
      input = input.subarray(headerEnd + 4);
      continue;
    }

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (input.length < bodyEnd) return;

    const body = input.subarray(bodyStart, bodyEnd).toString("utf8");
    input = input.subarray(bodyEnd);

    let request;
    try {
      request = JSON.parse(body);
    } catch (error) {
      sendMessage({ jsonrpc: "2.0", id: null, error: { code: -32700, message: String(error) } });
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(request, "id")) {
      continue;
    }

    try {
      const result = handleRequest(request);
      if (result === null) {
        sendMessage({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        });
      } else {
        sendMessage({ jsonrpc: "2.0", id: request.id, result });
      }
    } catch (error) {
      sendMessage({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message: String(error) } });
    }
  }
}

if (process.argv.includes("--print-config")) {
  process.stdout.write(`${JSON.stringify({ inboxes: defaultInboxPaths(), tools: tools.map((tool) => tool.name) }, null, 2)}\n`);
  process.exit(0);
}

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  consumeInput();
});

process.stdin.resume();
