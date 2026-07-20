import { describe, expect, it } from "vitest";
import type { KeyboardConfig, ScriptAction, WorkflowDefinition } from "@/types/actions";
import { importTaskIntoWorkflow } from "./workflowImport";

const action: ScriptAction = {
  type: "script",
  name: "Runme · test",
  shell: "terminal",
  content: "runme run test",
};
const source = {
  projectName: "demo",
  root: "/workspace/demo",
  file: "TASKS.md",
  line: 12,
};
const existing: WorkflowDefinition = {
  id: "workflow-existing",
  name: "发布",
  description: "",
  enabled: true,
  failurePolicy: "stop",
  steps: [],
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};
const config: KeyboardConfig = {
  pages: [],
  revision: 3,
  workflows: [existing],
};

describe("project task workflow import", () => {
  it("creates a named workflow only after confirmation", () => {
    const result = importTaskIntoWorkflow(config, action, source, {
      type: "new",
      name: "测试流程",
    });
    expect(result.created).toBe(true);
    expect(result.workflowName).toBe("测试流程");
    expect(result.config.revision).toBe(4);
    expect(result.config.workflows).toHaveLength(2);
    expect(result.config.workflows?.[1]?.steps[0]?.action).toEqual(action);
  });

  it("appends a step to an existing workflow", () => {
    const result = importTaskIntoWorkflow(config, action, source, {
      type: "existing",
      workflowId: existing.id,
    });
    expect(result.created).toBe(false);
    expect(result.workflowName).toBe(existing.name);
    expect(result.config.workflows?.[0]?.steps).toHaveLength(1);
  });

  it("rejects duplicate task imports", () => {
    const first = importTaskIntoWorkflow(config, action, source, {
      type: "existing",
      workflowId: existing.id,
    });
    expect(() => importTaskIntoWorkflow(first.config, action, source, {
      type: "existing",
      workflowId: existing.id,
    })).toThrow("已经包含该任务");
  });
});
