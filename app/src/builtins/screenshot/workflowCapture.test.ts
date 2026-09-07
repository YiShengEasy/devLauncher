import { describe, expect, it, vi } from "vitest";
import {
  cancelScreenshotWorkflowCapture,
  completeScreenshotWorkflowCapture,
  readActiveScreenshotWorkflowRequest,
  type WorkflowCaptureInvoke,
} from "./workflowCapture";

describe("screenshot workflow capture bridge", () => {
  it("uses the stable command for the active request", async () => {
    const invoke = vi.fn().mockResolvedValue({
      requestId: "request-1",
      copyToClipboard: true,
    }) as WorkflowCaptureInvoke;

    await expect(readActiveScreenshotWorkflowRequest(invoke)).resolves.toEqual({
      requestId: "request-1",
      copyToClipboard: true,
    });
    expect(invoke).toHaveBeenCalledWith("get_active_screenshot_workflow_request");
  });

  it("forwards completion metadata without image data transformations", async () => {
    const invoke = vi.fn().mockResolvedValue("/tmp/result.png") as WorkflowCaptureInvoke;
    const payload = {
      requestId: "request-1",
      data: "png-base64",
      width: 800,
      height: 600,
      copiedToClipboard: true,
      destinationPath: "/tmp/result.png",
    };

    await expect(completeScreenshotWorkflowCapture(invoke, payload))
      .resolves.toBe("/tmp/result.png");
    expect(invoke).toHaveBeenCalledWith(
      "complete_screenshot_workflow_capture",
      payload,
    );
  });

  it("cancels only the active request id", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined) as WorkflowCaptureInvoke;
    await cancelScreenshotWorkflowCapture(invoke, "request-1");
    expect(invoke).toHaveBeenCalledWith(
      "cancel_screenshot_workflow_capture",
      { requestId: "request-1" },
    );
  });
});
