import { invoke } from "@tauri-apps/api/core";
import type {
  Action,
  CompletionRule,
  StepCondition,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
} from "@/types/actions";

export interface WorkflowValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function workflowId(prefix: "workflow" | "step" = "workflow"): string {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${id}`;
}

export function defaultCompletionForAction(action: Action): CompletionRule {
  if (action.type === "script") {
    return { type: "process_exit", successCodes: [0], timeoutMs: 120_000 };
  }
  if (action.type === "app") {
    return { type: "process_started", stabilizationMs: 800, timeoutMs: 15_000 };
  }
  return { type: "action_resolved" };
}

export function createWorkflowStep(action: Action): WorkflowStep {
  return {
    id: workflowId("step"),
    name: action.name,
    enabled: true,
    action,
    condition: { type: "always" },
    completion: defaultCompletionForAction(action),
    delayMs: 0,
  };
}

export function createWorkflow(name = "新建工作流"): WorkflowDefinition {
  const now = new Date().toISOString();
  return {
    id: workflowId("workflow"),
    name,
    description: "",
    enabled: true,
    failurePolicy: "stop",
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function conditionLabel(condition: StepCondition): string {
  switch (condition.type) {
    case "always": return "始终执行";
    case "previous_success": return "上一步成功";
    case "previous_failed": return "上一步失败";
    case "platform": return `仅 ${condition.platform}`;
    case "path_exists": return `路径存在：${condition.path}`;
    case "env_equals": return `环境变量：${condition.name}`;
  }
}

export function completionLabel(completion: CompletionRule): string {
  switch (completion.type) {
    case "action_resolved": return "动作返回";
    case "process_started": return "进程已启动";
    case "process_exit": return "进程退出且成功";
    case "port_ready": return `端口 ${completion.port} 可用`;
    case "timer": return `等待 ${completion.durationMs} ms`;
    case "manual": return "人工确认";
    case "window_ready": return "目标窗口出现";
    case "url_ready": return "页面加载完成";
    case "connection_ready": return "连接建立";
  }
}

export function validateWorkflow(workflow: WorkflowDefinition): Promise<WorkflowValidationReport> {
  return invoke("validate_workflow", { workflow });
}

export function runWorkflow(workflowId: string): Promise<WorkflowRun> {
  return invoke("run_workflow", { workflowId });
}

export function runWorkflowStep(workflowId: string, stepId: string): Promise<WorkflowRun> {
  return invoke("run_workflow_step", { workflowId, stepId });
}

export function listWorkflowRuns(): Promise<WorkflowRun[]> {
  return invoke("list_workflow_runs");
}

export function getWorkflowRun(runId: string): Promise<WorkflowRun> {
  return invoke("get_workflow_run", { runId });
}

export function cancelWorkflowRun(runId: string): Promise<void> {
  return invoke("cancel_workflow_run", { runId });
}

export function confirmWorkflowStep(runId: string, stepId: string): Promise<void> {
  return invoke("confirm_workflow_step", { runId, stepId });
}
