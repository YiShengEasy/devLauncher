export type ScreenshotWorkflowRequest = {
  requestId: string;
  copyToClipboard: boolean;
};

export type CompleteScreenshotWorkflowPayload = {
  requestId: string;
  data: string;
  width: number;
  height: number;
  copiedToClipboard: boolean;
  destinationPath?: string;
};

export type WorkflowCaptureInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export function readActiveScreenshotWorkflowRequest(
  invokeCommand: WorkflowCaptureInvoke,
): Promise<ScreenshotWorkflowRequest | null> {
  return invokeCommand<ScreenshotWorkflowRequest | null>(
    "get_active_screenshot_workflow_request",
  );
}

export function completeScreenshotWorkflowCapture(
  invokeCommand: WorkflowCaptureInvoke,
  payload: CompleteScreenshotWorkflowPayload,
): Promise<string> {
  return invokeCommand<string>("complete_screenshot_workflow_capture", payload);
}

export function cancelScreenshotWorkflowCapture(
  invokeCommand: WorkflowCaptureInvoke,
  requestId: string,
): Promise<void> {
  return invokeCommand<void>("cancel_screenshot_workflow_capture", { requestId });
}
