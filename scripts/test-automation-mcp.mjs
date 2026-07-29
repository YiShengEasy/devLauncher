#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "devlauncher-automation-mcp-"));
const projectRoot = path.join(testDirectory, "fixture-project");
const projectId = "project-mcp-fixture";
fs.mkdirSync(projectRoot, { recursive: true });
fs.writeFileSync(
  path.join(projectRoot, "package.json"),
  JSON.stringify({ scripts: { test: "vitest run" } }),
);
fs.writeFileSync(
  path.join(testDirectory, "projecttasks_data.json"),
  JSON.stringify({
    schemaVersion: 2,
    projectProfiles: [{
      id: projectId,
      name: "fixture-project",
      root: projectRoot,
      createdAt: Date.now(),
      lastVisitedAt: Date.now(),
      status: "ready",
    }],
    projects: [],
    taskFavorites: [],
    configFavorites: [],
    lastRoot: projectRoot,
  }),
);
const child = spawn("node", ["mcp/devlauncher-automation-mcp.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    DEVLAUNCHER_CONFIG_PATH: path.join(testDirectory, "keyboard.yaml"),
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
  const requiredTools = [
    "devlauncher_preview_workflow",
    "devlauncher_apply_workflow",
    "devlauncher_list_projects",
    "devlauncher_list_project_tasks",
    "devlauncher_preview_project_task",
    "devlauncher_list_run_history",
    "devlauncher_list_capabilities",
    "devlauncher_get_capability",
  ];
  if (requiredTools.some((name) => !names.includes(name))) {
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

  const capabilities = await send(9, "tools/call", {
    name: "devlauncher_list_capabilities",
    arguments: {},
  });
  const capabilityIds = capabilities.result?.structuredContent?.data?.map((item) => item.id) ?? [];
  if (!capabilityIds.includes("clipboard.read_text") || !capabilityIds.includes("text.replace")) {
    throw new Error("Workflow capability discovery failed");
  }

  const capabilityPreview = await send(10, "tools/call", {
    name: "devlauncher_preview_workflow",
    arguments: {
      workflow: {
        name: "Capability protocol test",
        steps: [{
          id: "read-step",
          name: "Read clipboard",
          action: {
            type: "capability",
            name: "Read clipboard",
            capabilityId: "clipboard.read_text",
            inputs: {},
          },
        }],
      },
    },
  });
  if (capabilityPreview.result?.structuredContent?.ok !== true) {
    throw new Error("Capability workflow preview failed");
  }

  const projects = await send(4, "tools/call", {
    name: "devlauncher_list_projects",
    arguments: {},
  });
  if (projects.result?.structuredContent?.ok !== true) {
    throw new Error("Project listing failed");
  }

  const tasks = await send(5, "tools/call", {
    name: "devlauncher_list_project_tasks",
    arguments: { projectId },
  });
  const taskData = tasks.result?.structuredContent?.data?.tasks ?? [];
  if (tasks.result?.structuredContent?.ok !== true || taskData[0]?.sourceKey !== "test") {
    throw new Error("Project task discovery failed");
  }
  const serializedTasks = JSON.stringify(tasks.result?.structuredContent);
  if (serializedTasks.includes(projectRoot) || serializedTasks.includes("vitest run")) {
    throw new Error("Project task output exposed a path or command");
  }

  const taskPreview = await send(6, "tools/call", {
    name: "devlauncher_preview_project_task",
    arguments: {
      projectId,
      provider: "package",
      sourceKey: "test",
      file: "package.json",
      taskName: "test",
    },
  });
  if (taskPreview.result?.structuredContent?.data?.resolvable !== true) {
    throw new Error("Project task reference preview failed");
  }

  const history = await send(7, "tools/call", {
    name: "devlauncher_list_run_history",
    arguments: {},
  });
  if (history.result?.structuredContent?.ok !== true) {
    throw new Error("Run history listing failed");
  }

  const rejected = await send(8, "tools/call", {
    name: "devlauncher_run_project_task",
    arguments: {},
  });
  if (rejected.result?.structuredContent?.code !== "UNKNOWN_TOOL") {
    throw new Error("Unsupported execution tool was not rejected");
  }
  const audit = fs.readFileSync(path.join(testDirectory, "automation_audit.jsonl"), "utf8");
  if (!audit.includes(projectId) || audit.includes(projectRoot) || audit.includes("vitest run")) {
    throw new Error("Automation audit was missing or exposed sensitive project details");
  }
  process.stdout.write("automation MCP protocol test passed\n");
} finally {
  child.kill();
  fs.rmSync(testDirectory, { recursive: true, force: true });
}
