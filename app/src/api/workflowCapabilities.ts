import { invoke } from "@tauri-apps/api/core";
import type { WorkflowCapabilityDescriptor } from "@/types/actions";

export function listWorkflowCapabilities(): Promise<WorkflowCapabilityDescriptor[]> {
  return invoke("list_workflow_capabilities");
}
