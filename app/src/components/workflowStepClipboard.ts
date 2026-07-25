import type { WorkflowStep } from "@/types/actions";

export interface WorkflowStepClipboard {
  sourceWorkflowId: string;
  sourceWorkflowName: string;
  step: WorkflowStep;
}

export function copyWorkflowStep(
  step: WorkflowStep,
  sourceWorkflowId: string,
  sourceWorkflowName: string,
): WorkflowStepClipboard {
  return {
    sourceWorkflowId,
    sourceWorkflowName,
    step: structuredClone(step),
  };
}

export function pasteWorkflowStep(
  clipboard: WorkflowStepClipboard,
  targetWorkflowId: string,
  newStepId: string,
): WorkflowStep {
  const step = structuredClone(clipboard.step);
  return {
    ...step,
    id: newStepId,
    name: clipboard.sourceWorkflowId === targetWorkflowId
      ? `${step.name} 副本`
      : step.name,
  };
}
