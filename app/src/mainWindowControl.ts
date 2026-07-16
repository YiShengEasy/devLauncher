import { invoke } from "@tauri-apps/api/core";

type MainWindowAction = "show" | "hide" | "minimize";

function controlMainWindow(action: MainWindowAction): Promise<void> {
  return invoke<void>("control_main_window", { action });
}

export function hideMainWindowToTray(): Promise<void> {
  return controlMainWindow("hide");
}

export function minimizeMainWindow(): Promise<void> {
  return controlMainWindow("minimize");
}
