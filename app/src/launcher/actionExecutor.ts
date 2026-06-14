import type { BuiltinFeature } from "@/types/actions";
import type { LauncherActionRecord } from "./actionIndex";

export interface ActionExecutorDeps {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  writeText?: (text: string) => Promise<void>;
  openSearchWithText?: (text: string) => Promise<void>;
  dispatchEvent?: (event: Event) => boolean;
}

export function builtinToggleCommand(feature: BuiltinFeature): string {
  return feature === "json" ? "toggle_json_helper_window" : `toggle_${feature}_window`;
}

function textPayload(record: LauncherActionRecord): string {
  const text = record.payload?.text;
  return typeof text === "string" ? text : "";
}

function defaultWriteText(): ((text: string) => Promise<void>) | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.clipboard?.writeText?.bind(navigator.clipboard);
}

function defaultDispatchEvent(): ((event: Event) => boolean) | undefined {
  if (typeof window === "undefined") return undefined;
  return window.dispatchEvent.bind(window);
}

export async function executeLauncherAction(
  record: LauncherActionRecord,
  deps: ActionExecutorDeps,
): Promise<void> {
  if (record.actionKind === "execute-action") {
    if (!record.action) throw new Error(`Missing action for ${record.id}`);
    await deps.invoke("execute_action", { action: record.action });
    return;
  }

  if (record.actionKind === "toggle-builtin") {
    if (!record.builtinFeature) throw new Error(`Missing builtin feature for ${record.id}`);
    await deps.invoke(builtinToggleCommand(record.builtinFeature));
    return;
  }

  if (record.frontendCommand === "copy-ocr-text") {
    const writeText = deps.writeText ?? defaultWriteText();
    if (!writeText) throw new Error("Clipboard dependency is not available");
    await writeText(textPayload(record));
    return;
  }

  if (record.frontendCommand === "search-ocr-text") {
    if (!deps.openSearchWithText) throw new Error("Search entry dependency is not available");
    await deps.openSearchWithText(textPayload(record));
    return;
  }

  if (record.frontendCommand === "send-ocr-to-report") {
    const dispatchEvent = deps.dispatchEvent ?? defaultDispatchEvent();
    if (!dispatchEvent) throw new Error("Window event dependency is not available");

    await deps.invoke("show_screenshotai_window");
    dispatchEvent(new CustomEvent("devlauncher-ocr-report-text", { detail: { text: textPayload(record) } }));
    return;
  }

  throw new Error(`Unsupported launcher action ${record.id}`);
}
