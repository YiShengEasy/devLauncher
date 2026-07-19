import { describe, expect, it } from "vitest";
import { createWorkflow, createWorkflowStep, defaultCompletionForAction } from "./workflow";
import {
  BUILTIN_WORKFLOW_TEMPLATE_PACKAGE,
  createWorkflowFromTemplate,
  createWorkflowsFromTemplatePackage,
  listWorkflowTemplates,
  matchingOfficialTemplateId,
} from "./workflowTemplates";

describe("workflow helpers", () => {
  it("uses managed process exit for scripts", () => {
    expect(defaultCompletionForAction({
      type: "script",
      name: "Build",
      shell: "terminal",
      content: "npm run build",
    })).toEqual({
      type: "process_exit",
      successCodes: [0],
      timeoutMs: 120_000,
    });
  });

  it("creates stable workflow and step defaults", () => {
    const workflow = createWorkflow("Start project");
    const step = createWorkflowStep({
      type: "url",
      name: "Open app",
      target: "http://127.0.0.1:5173",
    });

    expect(workflow.id).toMatch(/^workflow-/);
    expect(workflow.failurePolicy).toBe("stop");
    expect(step.id).toMatch(/^step-/);
    expect(step.condition).toEqual({ type: "always" });
    expect(step.completion).toEqual({ type: "action_resolved" });
  });

  it("creates editable workflows from official templates", () => {
    const templates = listWorkflowTemplates();
    expect(templates.map((item) => item.id)).toContain("release-preflight");

    const workflow = createWorkflowFromTemplate("release-preflight");
    expect(workflow.id).toMatch(/^workflow-/);
    expect(workflow.name).toBe("发布前检查");
    expect(workflow.steps.length).toBeGreaterThan(2);
    expect(workflow.steps.every((step) => step.action.type === "script")).toBe(true);
    expect(workflow.steps.every((step) => step.condition.type === "always")).toBe(true);
    expect(matchingOfficialTemplateId(workflow)).toBe("release-preflight");

    workflow.name = "自定义发布前检查";
    expect(matchingOfficialTemplateId(workflow)).toBeUndefined();
  });

  it("creates workflows from a template package", () => {
    const workflows = createWorkflowsFromTemplatePackage(BUILTIN_WORKFLOW_TEMPLATE_PACKAGE);

    expect(workflows.length).toBe(listWorkflowTemplates().length);
    expect(workflows.some((item) => item.name.includes("监控"))).toBe(true);
    expect(workflows.every((item) => item.id.startsWith("workflow-"))).toBe(true);
  });
});
