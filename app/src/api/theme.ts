import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_THEME } from "@/types/actions";
import type { ThemeConfig } from "@/types/actions";

export const THEME_CONFIG_CHANGED_EVENT = "theme-config-changed";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function applyTheme(theme: ThemeConfig): void {
  const r = document.documentElement.style;
  r.setProperty("--theme-bg", hexToRgba(theme.bgColor, theme.bgOpacity));
  r.setProperty("--theme-blur", `${theme.blurRadius}px`);
  r.setProperty("--theme-border", theme.borderColor);
  r.setProperty("--theme-bg-solid", theme.bgColor);
}

/** Load theme from config and apply as CSS custom properties on <html>. */
export async function applyThemeFromConfig(): Promise<ThemeConfig> {
  let theme: ThemeConfig = { ...DEFAULT_THEME };
  try {
    const raw = await invoke<{ theme?: Partial<ThemeConfig> }>("load_config");
    if (raw.theme) theme = { ...DEFAULT_THEME, ...raw.theme };
  } catch {
    // Use defaults if load fails
  }
  applyTheme(theme);
  return theme;
}

/** Keep every Tauri window in sync with appearance changes from Settings. */
export async function watchThemeChanges(): Promise<() => void> {
  return listen<ThemeConfig>(THEME_CONFIG_CHANGED_EVENT, (event) => {
    applyTheme({ ...DEFAULT_THEME, ...event.payload });
  });
}
