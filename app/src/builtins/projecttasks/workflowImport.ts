import { createWorkflow, createWorkflowStep } from "@/api/workflow";
import type {
  KeyboardConfig,
  ScriptAction,
  WorkflowDefinition,
} from "@/types/actions";

export type WorkflowImportTarget =
  | { type: "new"; name: string }
  | { type: "existing"; workflowId: string };

export interface WorkflowImportSource {
  projectName: string;
  root: string;
  file: string;
  line: number;
}

export interface WorkflowImportResult {
  config: KeyboardConfig;
  workflowId: string;
  workflowName: string;
  created: boolean;
}

function containsAction(workflow: WorkflowDefinition, action: ScriptAction): boolean {
  return workflow.steps.some((step) =>
    step.action.type === "script"
    && step.action.content === action.content
    && step.action.name === action.name
  );
}

export function importTaskIntoWorkflow(
  config: KeyboardConfig,
  action: ScriptAction,
  source: WorkflowImportSource,
  target: WorkflowImportTarget,
): WorkflowImportResult {
  const workflows = config.workflows ?? [];
  if (target.type === "new") {
    const name = target.name.trim();
    if (!name) throw new Error("请输入工作流名称");
    const workflow = createWorkflow(name);
    workflow.description = `项目：${source.projectName}\n来源：${source.file}:${source.line}\n目录：${source.root}`;
    workflow.steps = [createWorkflowStep(action)];
    return {
      config: {
        ...config,
        revision: (config.revision ?? 0) + 1,
        workflows: [...workflows, workflow],
      },
      workflowId: workflow.id,
      workflowName: workflow.name,
      created: true,
    };
  }

  const workflow = workflows.find((item) => item.id === target.workflowId);
  if (!workflow) throw new Error("选择的工作流已不存在，请重新选择");
  if (containsAction(workflow, action)) {
    throw new Error(`“${workflow.name}”中已经包含该任务`);
  }
  const step = createWorkflowStep(action);
  return {
    config: {
      ...config,
      revision: (config.revision ?? 0) + 1,
      workflows: workflows.map((item) =>
        item.id === workflow.id
          ? { ...item, steps: [...item.steps, step] }
          : item
      ),
    },
    workflowId: workflow.id,
    workflowName: workflow.name,
    created: false,
  };
}
