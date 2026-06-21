import type { Action, BuiltinFeature } from "@/types/actions";
import type { LauncherActionRecord } from "./actionIndex";

export interface ActionExecutorDeps {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

export function builtinToggleCommand(feature: BuiltinFeature): string {
  if (feature === "clipboard") return "show_clipboard_window";
  if (feature === "screenshotai") return "show_screenshotai_window";
  return feature === "json" ? "toggle_json_helper_window" : `toggle_${feature}_window`;
}

export async function executeAction(
  action: Action,
  deps: ActionExecutorDeps,
): Promise<void> {
  if (action.type === "builtin") {
    await deps.invoke(builtinToggleCommand(action.feature));
    return;
  }

  if (action.type === "plugin") {
    await deps.invoke("open_plugin_window", {
      pluginId: action.pluginId,
      actionId: action.actionId,
    });
    return;
  }

  await deps.invoke("execute_action", { action });
}

export async function executeLauncherAction(
  record: LauncherActionRecord,
  deps: ActionExecutorDeps,
): Promise<void> {
  if (record.actionKind === "execute-action") {
    if (!record.action) throw new Error(`Missing action for ${record.id}`);
    await executeAction(record.action, deps);
    return;
  }

  if (record.actionKind === "toggle-builtin") {
    if (!record.builtinFeature) throw new Error(`Missing builtin feature for ${record.id}`);
    await deps.invoke(builtinToggleCommand(record.builtinFeature));
    return;
  }

  throw new Error(`Unsupported launcher action ${record.id}`);
}
