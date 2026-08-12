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

  it("uses real completion for capability actions", () => {
    expect(defaultCompletionForAction({
      type: "capability",
      name: "Read clipboard",
      capabilityId: "clipboard.read_text",
      inputs: {},
    })).toEqual({ type: "capability_completed" });
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
    expect(step.retry).toBeUndefined();
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

  it("materializes capability output references with generated step IDs", () => {
    const workflow = createWorkflowFromTemplate("clipboard-text-pipeline");
    const [read, replace, template, write] = workflow.steps;

    expect(read.action.type).toBe("capability");
    expect(replace.action.type).toBe("capability");
    if (replace.action.type !== "capability" || template.action.type !== "capability" || write.action.type !== "capability") {
      throw new Error("Expected capability actions");
    }
    expect(replace.action.inputs.text).toBe(`\${steps.${read.id}.outputs.text}`);
    expect(template.action.inputs.template).toBe(`整理结果：\n\${steps.${replace.id}.outputs.text}`);
    expect(write.action.inputs.text).toBe(`\${steps.${template.id}.outputs.text}`);
    expect(matchingOfficialTemplateId(workflow)).toBe("clipboard-text-pipeline");
  });

  it("creates the interactive screenshot capability template", () => {
    const workflow = createWorkflowFromTemplate("interactive-screenshot");
    expect(workflow.steps).toHaveLength(1);
    const [capture] = workflow.steps;
    expect(capture.completion).toEqual({ type: "capability_completed" });
    expect(capture.action).toMatchObject({
      type: "capability",
      capabilityId: "screenshot.capture",
      inputs: {
        copyToClipboard: true,
        timeoutSeconds: 300,
      },
    });
    expect(matchingOfficialTemplateId(workflow)).toBe("interactive-screenshot");

    workflow.steps[0].retry = { maxAttempts: 2, delayMs: 1000 };
    expect(matchingOfficialTemplateId(workflow)).toBeUndefined();
  });

  it("materializes the screenshot OCR translation pipeline", () => {
    const workflow = createWorkflowFromTemplate("screenshot-ocr-translate");
    const [capture, ocr, translate, copy] = workflow.steps;
    if (
      ocr.action.type !== "capability"
      || translate.action.type !== "capability"
      || copy.action.type !== "capability"
    ) {
      throw new Error("Expected capability actions");
    }
    expect(ocr.action.inputs.path).toBe(`\${steps.${capture.id}.outputs.path}`);
    expect(translate.action.inputs.text).toBe(`\${steps.${ocr.id}.outputs.text}`);
    expect(translate.action.inputs.targetLanguage).toBe("zh-Hans");
    expect(copy.action.inputs.text).toBe(`\${steps.${translate.id}.outputs.targetText}`);
    expect(matchingOfficialTemplateId(workflow)).toBe("screenshot-ocr-translate");
  });
});
