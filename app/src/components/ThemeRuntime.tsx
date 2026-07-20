import { useEffect } from "react";
import { applyThemeFromConfig, watchThemeChanges } from "@/api/theme";

const IS_TAURI_RUNTIME = Boolean(
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
);

export function ThemeRuntime() {
  useEffect(() => {
    if (!IS_TAURI_RUNTIME) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void applyThemeFromConfig();
    void watchThemeChanges().then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return null;
}
