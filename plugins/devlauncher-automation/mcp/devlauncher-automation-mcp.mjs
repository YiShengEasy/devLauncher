#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start) {
  let current = start;
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(current, "app", "src-tauri", "Cargo.toml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const repoRoot = findRepoRoot(here);
const manifestPath = repoRoot ? path.join(repoRoot, "app", "src-tauri", "Cargo.toml") : null;
const debugCtl = repoRoot
  ? path.join(
      repoRoot,
      "app",
      "src-tauri",
      "target",
      "debug",
      process.platform === "win32" ? "devlauncherctl.exe" : "devlauncherctl",
    )
  : null;

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function defaultCompletion(action = {}) {
  if (action.type === "script") {
    return { type: "process_exit", successCodes: [0], timeoutMs: 120000 };
  }
  if (action.type === "app") {
    return { type: "process_started", stabilizationMs: 800, timeoutMs: 15000 };
  }
  return { type: "action_resolved" };
}

function normalizeWorkflow(input) {
  const source = input && typeof input === "object" ? structuredClone(input) : {};
  const now = new Date().toISOString();
  const workflow = {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : id("workflow"),
    name: typeof source.name === "string" ? source.name.trim() : "",
    description: typeof source.description === "string" ? source.description : "",
    enabled: source.enabled !== false,
    failurePolicy: source.failurePolicy === "continue" ? "continue" : "stop",
    steps: Array.isArray(source.steps)
      ? source.steps.map((entry) => {
          const step = entry && typeof entry === "object" ? entry : {};
          const action = step.action && typeof step.action === "object" ? step.action : {};
          return {
            id: typeof step.id === "string" && step.id.trim() ? step.id.trim() : id("step"),
            name: typeof step.name === "string" && step.name.trim()
              ? step.name.trim()
              : typeof action.name === "string"
                ? action.name
                : "未命名步骤",
            enabled: step.enabled !== false,
            action,
            condition: step.condition && typeof step.condition === "object"
              ? step.condition
              : { type: "always" },
            completion: step.completion && typeof step.completion === "object"
              ? step.completion
              : defaultCompletion(action),
            delayMs: Number.isFinite(step.delayMs) ? Math.max(0, Math.trunc(step.delayMs)) : 0,
            ...(step.onFailure === "continue" || step.onFailure === "stop"
              ? { onFailure: step.onFailure }
              : {}),
          };
        })
      : [],
    createdAt: typeof source.createdAt === "string" && source.createdAt ? source.createdAt : now,
    updatedAt: now,
  };
  return workflow;
}

function findSecretFields(value, trail = []) {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findings.push(...findSecretFields(entry, [...trail, String(index)])));
    return findings;
  }
  if (!value || typeof value !== "object") return findings;
  for (const [key, entry] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (/^(password|token|secret|privateKey|cookie|authorization)$/i.test(key)) {
      findings.push(nextTrail.join("."));
    }
    findings.push(...findSecretFields(entry, nextTrail));
  }
  return findings;
}

function scanRisks(workflow) {
  const findings = [];
  for (const step of workflow.steps ?? []) {
    const action = step.action ?? {};
    if (action.type === "script") {
      const script = `${action.content ?? ""}\n${action.file ?? ""}`;
      const patterns = [
        ["privilege_escalation", /\bsudo\b|runas\s/i],
        ["broad_deletion", /\brm\s+-rf\b|\bRemove-Item\b.*-Recurse/i],
        ["download_to_shell", /\b(curl|wget)\b[^|\n]*\|\s*(sh|bash|zsh)\b/i],
        ["system_power", /\b(shutdown|reboot|Restart-Computer|Stop-Computer)\b/i],
        ["credential_access", /\b(keychain|credential|\.ssh|security\s+find-)\b/i],
      ];
      for (const [category, pattern] of patterns) {
        if (pattern.test(script)) {
          findings.push({ stepId: step.id, category, severity: "high" });
        }
      }
    }
    if (action.type === "ssh") {
      findings.push({ stepId: step.id, category: "remote_connection", severity: "medium" });
    }
    if (action.type === "url" && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\b/i.test(action.target ?? "")) {
      findings.push({ stepId: step.id, category: "external_network", severity: "medium" });
    }
  }
  return findings;
}

function ctlInvocation(command, input, ...extraArgs) {
  const explicit = process.env.DEVLAUNCHER_CTL;
  let executable;
  let args;
  if (explicit) {
    executable = explicit;
    args = [command, ...extraArgs];
  } else if (debugCtl && fs.existsSync(debugCtl)) {
    executable = debugCtl;
    args = [command, ...extraArgs];
  } else {
    if (!manifestPath || !repoRoot) {
      throw new Error("devlauncherctl was not found; set DEVLAUNCHER_CTL to the packaged executable");
    }
    executable = "cargo";
    args = ["run", "--quiet", "--manifest-path", manifestPath, "--bin", "devlauncherctl", "--", command, ...extraArgs];
  }
  const result = spawnSync(executable, args, {
    cwd: repoRoot ?? process.cwd(),
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: "utf8",
    timeout: 30000,
    env: process.env,
  });
  if (result.error) {
    throw new Error(`devlauncherctl failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `devlauncherctl exited with ${result.status}`);
  }
  const output = result.stdout.trim();
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`devlauncherctl returned invalid JSON: ${output.slice(0, 240)}`);
  }
}

function textResult(value, isError = false) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

const workflowSchema = {
  type: "object",
  description: "Workflow draft. IDs and defaults are generated when omitted.",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    enabled: { type: "boolean" },
    failurePolicy: { type: "string", enum: ["stop", "continue"] },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          enabled: { type: "boolean" },
          action: { type: "object" },
          condition: { type: "object" },
          completion: { type: "object" },
          delayMs: { type: "number" },
          onFailure: { type: "string", enum: ["stop", "continue"] },
        },
        required: ["action"],
      },
    },
    createdAt: { type: "string" },
  },
  required: ["name", "steps"],
};

const tools = [
  {
    name: "devlauncher_get_capabilities",
    description: "Get supported DevLauncher workflow actions, conditions, completion rules, platforms, and limits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "devlauncher_list_workflows",
    description: "List saved DevLauncher workflows and return the current configuration revision.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "devlauncher_get_workflow",
    description: "Get one saved DevLauncher workflow by stable ID or exact name.",
    inputSchema: {
      type: "object",
      properties: { identifier: { type: "string" } },
      required: ["identifier"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "devlauncher_preview_workflow",
    description: "Normalize and validate a workflow draft without saving or executing it.",
    inputSchema: {
      type: "object",
      properties: { workflow: workflowSchema },
      required: ["workflow"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "devlauncher_apply_workflow",
    description: "Create or update a validated workflow. Requires the revision returned by list, get, or preview. This never executes the workflow.",
    inputSchema: {
      type: "object",
      properties: {
        expectedRevision: { type: "integer", minimum: 0 },
        workflow: workflowSchema,
      },
      required: ["expectedRevision", "workflow"],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "devlauncher_bind_workflow",
    description: "Bind a saved workflow to a virtual keyboard key.",
    inputSchema: {
      type: "object",
      properties: {
        expectedRevision: { type: "integer", minimum: 0 },
        workflowId: { type: "string" },
        pageName: { type: "string" },
        pageIndex: { type: "integer", minimum: 0 },
        key: { type: "string", pattern: "^[0-9A-Z]$" },
        replace: { type: "boolean" },
      },
      required: ["expectedRevision", "workflowId", "key"],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "devlauncher_delete_workflow",
    description: "Delete a workflow. Bound keys are only removed when removeBindings is true.",
    inputSchema: {
      type: "object",
      properties: {
        expectedRevision: { type: "integer", minimum: 0 },
        workflowId: { type: "string" },
        removeBindings: { type: "boolean" },
      },
      required: ["expectedRevision", "workflowId"],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "devlauncher_unbind_key",
    description: "Remove one virtual keyboard binding.",
    inputSchema: {
      type: "object",
      properties: {
        expectedRevision: { type: "integer", minimum: 0 },
        pageName: { type: "string" },
        pageIndex: { type: "integer", minimum: 0 },
        key: { type: "string", pattern: "^[0-9A-Z]$" },
      },
      required: ["expectedRevision", "key"],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];

function handleToolCall(params = {}) {
  const name = params.name;
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
  let result;

  if (name === "devlauncher_get_capabilities") {
    result = ctlInvocation("capabilities");
  } else if (name === "devlauncher_list_workflows") {
    result = ctlInvocation("list");
  } else if (name === "devlauncher_get_workflow") {
    result = ctlInvocation("get", undefined, args.identifier);
  } else if (name === "devlauncher_preview_workflow") {
    const workflow = normalizeWorkflow(args.workflow);
    result = ctlInvocation("preview", workflow);
    result.data = { ...(result.data ?? {}), risks: scanRisks(workflow), secretFields: findSecretFields(workflow) };
  } else if (name === "devlauncher_apply_workflow") {
    const workflow = normalizeWorkflow(args.workflow);
    const secretFields = findSecretFields(workflow);
    if (secretFields.length) {
      result = {
        ok: false,
        code: "SECRET_FIELD_REJECTED",
        message: "Store credentials in the OS credential store and pass references only.",
        data: { fields: secretFields },
      };
    } else {
      result = ctlInvocation("apply", {
        expectedRevision: args.expectedRevision,
        workflow,
      });
      result.data = { ...(result.data ?? {}), workflow, risks: scanRisks(workflow) };
    }
  } else if (name === "devlauncher_bind_workflow") {
    result = ctlInvocation("bind", args);
  } else if (name === "devlauncher_delete_workflow") {
    result = ctlInvocation("delete", args);
  } else if (name === "devlauncher_unbind_key") {
    result = ctlInvocation("unbind", args);
  } else {
    return textResult({ ok: false, code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` }, true);
  }

  return textResult(result, result?.ok === false);
}

function handleRequest(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: request.params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "devlauncher-automation-mcp", version: "0.1.0" },
    };
  }
  if (request.method === "tools/list") return { tools };
  if (request.method === "tools/call") return handleToolCall(request.params);
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
    if (!Object.prototype.hasOwnProperty.call(request, "id")) continue;
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
  process.stdout.write(`${JSON.stringify({
    name: "devlauncher-automation-mcp",
    ctl: process.env.DEVLAUNCHER_CTL || (debugCtl && fs.existsSync(debugCtl) ? debugCtl : "cargo run"),
    tools: tools.map((tool) => tool.name),
  }, null, 2)}\n`);
  process.exit(0);
}

process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  consumeInput();
});
process.stdin.resume();
