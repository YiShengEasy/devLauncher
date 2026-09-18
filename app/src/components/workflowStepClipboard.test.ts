import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "@/types/actions";
import { copyWorkflowStep, pasteWorkflowStep } from "./workflowStepClipboard";

const STEP: WorkflowStep = {
  id: "step-source",
  name: "启动后端",
  enabled: true,
  action: {
    type: "script",
    name: "启动后端",
    shell: "terminal",
    content: "npm run dev",
  },
  condition: { type: "path_exists", path: "/tmp/project" },
  completion: { type: "port_ready", host: "127.0.0.1", port: 3000, intervalMs: 500, timeoutMs: 30_000 },
  delayMs: 250,
  retry: { maxAttempts: 3, delayMs: 1500 },
  onFailure: "stop",
};

describe("workflow step clipboard", () => {
  it("pastes a complete independent step into another workflow", () => {
    const clipboard = copyWorkflowStep(STEP, "workflow-a", "开发环境");
    const pasted = pasteWorkflowStep(clipboard, "workflow-b", "step-new");

    expect(pasted).toEqual({ ...STEP, id: "step-new" });
    expect(pasted).not.toBe(clipboard.step);
    expect(pasted.action).not.toBe(clipboard.step.action);

    if (pasted.action.type === "script") pasted.action.content = "npm test";
    expect(clipboard.step.action).toEqual(STEP.action);
  });

  it("marks a step pasted back into the same workflow as a copy", () => {
    const clipboard = copyWorkflowStep(STEP, "workflow-a", "开发环境");
    const pasted = pasteWorkflowStep(clipboard, "workflow-a", "step-copy");

    expect(pasted.id).toBe("step-copy");
    expect(pasted.name).toBe("启动后端 副本");
  });
});
