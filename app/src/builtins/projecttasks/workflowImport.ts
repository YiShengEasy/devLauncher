import { createWorkflow, createWorkflowStep } from "@/api/workflow";
import { matchingOfficialTemplateId } from "@/api/workflowTemplates";
import type {
  KeyboardConfig,
  ProjectTaskAction,
  ScriptAction,
  WorkflowDefinition,
} from "@/types/actions";

export type WorkflowImportTarget =
  | { type: "new"; name: string }
  | { type: "existing"; workflowId: string };

export interface WorkflowImportSource {
  projectName: string;
  file: string;
  line: number;
}

export interface WorkflowImportResult {
  config: KeyboardConfig;
  workflowId: string;
  workflowName: string;
  created: boolean;
}

type ImportableProjectAction = ProjectTaskAction | ScriptAction;

function containsAction(workflow: WorkflowDefinition, action: ImportableProjectAction): boolean {
  return workflow.steps.some((step) => {
    if (action.type === "project_task" && step.action.type === "project_task") {
      return step.action.projectId === action.projectId
        && step.action.provider === action.provider
        && step.action.sourceKey === action.sourceKey;
    }
    return action.type === "script"
      && step.action.type === "script"
      && step.action.content === action.content
      && step.action.name === action.name;
  });
}

export function listUserCreatedWorkflows(
  workflows: WorkflowDefinition[],
): WorkflowDefinition[] {
  return workflows.filter((workflow) => !matchingOfficialTemplateId(workflow));
}

export function importTaskIntoWorkflow(
  config: KeyboardConfig,
  action: ImportableProjectAction,
  source: WorkflowImportSource,
  target: WorkflowImportTarget,
): WorkflowImportResult {
  const workflows = config.workflows ?? [];
  if (target.type === "new") {
    const name = target.name.trim();
    if (!name) throw new Error("请输入工作流名称");
    const workflow = createWorkflow(name);
    workflow.description = `项目：${source.projectName}\n来源：${source.file}:${source.line}`;
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

  const workflow = listUserCreatedWorkflows(workflows)
    .find((item) => item.id === target.workflowId);
  if (!workflow) throw new Error("请选择一个用户自建的工作流");
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
