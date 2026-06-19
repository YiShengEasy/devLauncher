import { describe, expect, it, vi } from "vitest";
import type { Action } from "@/types/actions";
import type { LauncherActionRecord } from "./actionIndex";
import { executeAction, executeLauncherAction } from "./actionExecutor";

describe("actionExecutor", () => {
  it("toggles builtin actions when executing a direct action", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const action: Action = { type: "builtin", name: "剪切板", feature: "clipboard" };

    await executeAction(action, {
      invoke: async (command, args) => {
        calls.push([command, args]);
      },
    });

    expect(calls).toEqual([["show_clipboard_window", undefined]]);
  });

  it("uses execute_action for non-builtin direct actions", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const action: Action = { type: "url", name: "Docs", target: "https://example.com" };

    await executeAction(action, {
      invoke: async (command, args) => {
        calls.push([command, args]);
      },
    });

    expect(calls).toEqual([["execute_action", { action }]]);
  });

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
