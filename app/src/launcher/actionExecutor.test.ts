import { describe, expect, it, vi } from "vitest";
import type { LauncherActionRecord } from "./actionIndex";
import { executeLauncherAction } from "./actionExecutor";

describe("actionExecutor", () => {
  it("executes normal actions through execute_action", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const record: LauncherActionRecord = {
      id: "keyboard:0:Q",
      title: "VS Code",
      source: "keyboard",
      actionKind: "execute-action",
      action: { type: "app", name: "VS Code", target: "C:/Code/Code.exe" },
      keywords: ["vs code"],
    };

    await executeLauncherAction(record, { invoke });

    expect(invoke).toHaveBeenCalledWith("execute_action", { action: record.action });
  });

  it("executes builtin records through the matching toggle command", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const record: LauncherActionRecord = {
      id: "builtin:json",
      title: "JSON",
      source: "builtin",
      actionKind: "toggle-builtin",
      builtinFeature: "json",
      keywords: ["json"],
    };

    await executeLauncherAction(record, { invoke });

    expect(invoke).toHaveBeenCalledWith("toggle_json_helper_window");
  });
});
