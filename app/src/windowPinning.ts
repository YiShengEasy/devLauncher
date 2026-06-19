import { invoke } from "@tauri-apps/api/core";

export interface WindowPinState {
  label: string;
  pinned: boolean;
  defaultPinned: boolean;
  supported: boolean;
}

export const WINDOW_PIN_CHANGED_EVENT = "window-pin-changed";

export function getWindowPinState(label: string): Promise<WindowPinState> {
  return invoke<WindowPinState>("get_window_pin_state", { label });
}

export function setWindowPinState(label: string, pinned: boolean): Promise<WindowPinState> {
  return invoke<WindowPinState>("set_window_pin_state", { label, pinned });
}
