import { useEffect, useState, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { register as registerShortcut, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import gsap from "gsap";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { loadConfig, saveConfig } from "@/api/config";
import { KeyboardPanel } from "@/components/KeyboardPanel";
import { BindingModal } from "@/components/BindingModal";
import { SettingsPanel } from "@/components/SettingsPanel";
import { MacWindowControls } from "@/components/MacWindowControls";
import { getStoredEntryPosition, setStoredEntryPosition } from "@/entry/windowPosition";
import type { Action, KeyId, BuiltinAction, KeyboardConfig, ThemeConfig } from "@/types/actions";
import { AddIcon, DeleteIcon, RenameIcon, SettingsIcon } from "@/icons";
import { PixelPetIcon, SearchIcon } from "@/icons/entryIcons";
import { animateDialogEnter, animatePanelEnter } from "@/motion/presets";
import { motionDuration, motionEase } from "@/motion/tokens";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { getGlobalShortcuts, keyIdToShortcut } from "@/platform/shortcuts";
import "./index.css";

const KEYBOARD_RETURN_ANIMATION_KEY = "devlauncher:keyboard-return-animation";
const PET_RETURN_ANIMATION_KEY = "devlauncher:pet-return-animation";
const MAIN_WINDOW_WIDTH = 920;
const MAIN_WINDOW_HEIGHT = 540;
const PET_WINDOW_SIZE = 284;
const GLOBAL_SHORTCUTS = getGlobalShortcuts();

function builtinToggleCommand(feature: BuiltinAction["feature"]): string {
  return feature === "json" ? "toggle_json_helper_window" : `toggle_${feature}_window`;
}

// Hex to rgba helper
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function launcherShellBackground(theme: ThemeConfig): string {
  const bgColor = theme.bgColor.toLowerCase();
  const borderColor = theme.borderColor.toLowerCase();
  const isWarm = bgColor === "#17130f";
  const isAurora = borderColor.startsWith("#848eb2");

  if (isWarm) {
    return [
      "linear-gradient(90deg, rgba(255,232,198,0.011) 1px, transparent 1px) 0 0 / 39px 39px",
      "linear-gradient(0deg, rgba(255,232,198,0.008) 1px, transparent 1px) 0 0 / 39px 39px",
      "radial-gradient(circle at 98% 29%, rgba(132,63,62,0.18), transparent 18%)",
      "radial-gradient(circle at 18% 4%, rgba(98,68,40,0.22), transparent 30%)",
      "radial-gradient(circle at 8% 96%, rgba(105,61,50,0.45), transparent 24%)",
      "linear-gradient(145deg, #1e1a14, #11100d 58%, #0a0a08)",
    ].join(", ");
  }

  if (isAurora) {
    return [
      "linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px) 0 0 / 39px 39px",
      "linear-gradient(0deg, rgba(255,255,255,0.008) 1px, transparent 1px) 0 0 / 39px 39px",
      "radial-gradient(circle at 88% 13%, rgba(205,89,84,0.24), transparent 22%)",
      "radial-gradient(circle at 66% 8%, rgba(94,73,178,0.28), transparent 30%)",
      "radial-gradient(circle at 11% 96%, rgba(116,58,128,0.42), transparent 28%)",
      "linear-gradient(145deg, #121a2a, #07111e 58%, #08101d)",
    ].join(", ");
  }

  return [
    "linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px) 0 0 / 39px 39px",
    "linear-gradient(0deg, rgba(255,255,255,0.008) 1px, transparent 1px) 0 0 / 39px 39px",
    "radial-gradient(circle at 98% 29%, rgba(160,70,70,0.18), transparent 18%)",
    "radial-gradient(circle at 18% 4%, rgba(43,55,131,0.22), transparent 30%)",
    "radial-gradient(circle at 8% 96%, rgba(113,58,77,0.47), transparent 24%)",
    "linear-gradient(145deg, #191d2b, #080e19 58%, #0b121f)",
  ].join(", ");
}

function getUrlOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

// Debounce guard: ignore repeated triggers within 400ms
function makeDebounced<T extends unknown[]>(fn: (...args: T) => void, ms = 400) {
  let last = 0;
  return (...args: T) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  };
}

export default function App() {
  const {
    config, activePageIndex,
    loading, error,
    setConfig, setLoading, setError, setActivePageIndex,
    bindKey, addPage, renamePage, removePage,
    showSettings, setShowSettings, theme,
  } = useKeyboardStore();

  const [bindingKey, setBindingKey] = useState<KeyId | null>(null);
  const [modeTransition, setModeTransition] = useState<"idle" | "to-pet">("idle");

  // Tab editing state
  const [editingTabIndex, setEditingTabIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [tabMenu, setTabMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);
  const rootPanelRef = useRef<HTMLDivElement>(null);
  const settingsDialogRef = useRef<HTMLDivElement>(null);
  const petModeButtonRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();

  const resetKeyboardPanelVisualState = useCallback(() => {
    const panel = rootPanelRef.current;
    const petButton = petModeButtonRef.current;

    gsap.killTweensOf([panel, petButton]);
    if (panel) {
      gsap.set(panel, {
        autoAlpha: 1,
        x: 0,
        y: 0,
        scale: 1,
        borderRadius: 16,
        filter: "none",
      });
    }
    if (petButton) {
      gsap.set(petButton, {
        autoAlpha: 1,
        scale: 1,
        rotation: 0,
        filter: "none",
      });
    }
  }, []);

  const playKeyboardReturnTimeline = useCallback(() => {
    const panel = rootPanelRef.current;
    if (!panel) return;

    if (reducedMotion) {
      animatePanelEnter(panel, reducedMotion);
      return;
    }

    gsap.fromTo(
      panel,
      {
        autoAlpha: 0,
        y: reducedMotion ? 0 : 10,
        scale: reducedMotion ? 1 : 0.94,
        borderRadius: reducedMotion ? 16 : 28,
        filter: "blur(1px) brightness(1.18) saturate(1.16)",
      },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        borderRadius: 16,
        filter: "none",
        duration: motionDuration.playful,
        ease: motionEase.enter,
        overwrite: "auto",
      },
    );
  }, [reducedMotion]);

  useGsapContext(rootPanelRef, () => {
    if (!rootPanelRef.current) return;
    animatePanelEnter(rootPanelRef.current, reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    const handleWindowFocus = () => {
      if (modeTransition === "to-pet") return;
      const shouldAnimateReturn = window.localStorage.getItem(KEYBOARD_RETURN_ANIMATION_KEY) === "1";
      if (shouldAnimateReturn) {
        window.localStorage.removeItem(KEYBOARD_RETURN_ANIMATION_KEY);
      }

      resetKeyboardPanelVisualState();
      if (shouldAnimateReturn && rootPanelRef.current) {
        playKeyboardReturnTimeline();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleWindowFocus);
    };
  }, [modeTransition, playKeyboardReturnTimeline, resetKeyboardPanelVisualState]);

  useGsapContext(settingsDialogRef, () => {
    if (!showSettings || !settingsDialogRef.current) return;
    animateDialogEnter(settingsDialogRef.current, reducedMotion);
  }, [showSettings, reducedMotion]);

  // Extract app icons from .exe files.
  const extractAllAppIcons = useCallback(async (cfg: KeyboardConfig) => {
    const paths = new Set<string>();
    for (const page of cfg.pages) {
      for (const binding of Object.values(page.keys)) {
        const action = (binding as { action: Action | null })?.action;
        if (action?.type === "app" && (action as { target: string }).target) {
          paths.add((action as { target: string }).target);
        }
      }
    }
    if (paths.size === 0) return;
    try {
      const icons = await invoke<Record<string, string>>("extract_app_icons", {
        targets: Array.from(paths),
      });
      useKeyboardStore.getState().setAppIcons(icons);
    } catch (e) {
      console.error("[DevLauncher] extract_app_icons failed:", e);
    }
  }, []);

  const loadFavicons = useCallback(async (cfg: KeyboardConfig) => {
    const origins = new Set<string>();
    for (const page of cfg.pages) {
      for (const binding of Object.values(page.keys)) {
        const action = (binding as { action: Action | null })?.action;
        if (action?.type === "url" && (action as { target: string }).target) {
          const origin = getUrlOrigin((action as { target: string }).target);
          if (origin) origins.add(origin);
        }
      }
    }
    if (origins.size === 0) return;
    const requests = Array.from(origins).map((origin) => ({ origin }));
    try {
      const cachedFavicons = await invoke<Record<string, string>>("get_cached_favicons", {
        requests,
      });
      useKeyboardStore.getState().setFavicons(cachedFavicons);
      invoke<Record<string, string>>("refresh_favicons", { requests })
        .then((favicons) => useKeyboardStore.getState().setFavicons(favicons))
        .catch((e) => console.warn("[DevLauncher] refresh_favicons failed:", e));
    } catch (e) {
      console.warn("[DevLauncher] get_cached_favicons failed:", e);
    }
  }, []);

  // Load config on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const cfg = await loadConfig();
        setConfig(cfg);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Re-extract app icons whenever config changes (handles cases where
  // initial extraction ran before icons were available or failed silently)
  useEffect(() => {
    if (!config) return;
    const timer = window.setTimeout(() => {
      extractAllAppIcons(config);
      loadFavicons(config);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [config, extractAllAppIcons, loadFavicons]);

  // Inject theme as CSS custom properties so any panel can read them
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--theme-bg", hexToRgba(theme.bgColor, theme.bgOpacity));
    r.setProperty("--theme-blur", `${theme.blurRadius}px`);
    r.setProperty("--theme-border", theme.borderColor);
    r.setProperty("--theme-bg-solid", theme.bgColor);
  }, [theme]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("open-settings", () => {
      setShowSettings(true);
    }).then((fn) => {
      unlisten = fn;
    }).catch(console.error);
    return () => {
      unlisten?.();
    };
  }, [setShowSettings]);
  // Extract app icons from .exe files.

  // Execute action on key click
  const handleKeyClick = useCallback(async (keyId: KeyId) => {
    const page = config?.pages[activePageIndex];
    const action = page?.keys[keyId]?.action;
    if (!action) return;
    // Handle builtin actions locally
    if (action.type === "builtin") {
      const b = action as BuiltinAction;
      invoke(builtinToggleCommand(b.feature)).catch((e) => {
        console.error("builtin action failed:", e);
        if (b.feature === "screenshot") {
          window.alert(`截图失败：${String(e)}`);
        }
      });
      return;
    }
    try {
      await invoke("execute_action", { action });
    } catch (e) {
      console.error("execute_action failed:", e);
    }
  }, [config, activePageIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.repeat) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      const state = useKeyboardStore.getState();
      if (!state.config || state.config.pages.length < 2) return;
      const count = state.config.pages.length;
      const next = e.shiftKey
        ? (state.activePageIndex - 1 + count) % count
        : (state.activePageIndex + 1) % count;
      state.setActivePageIndex(next);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!config) return;
    const page = config.pages[activePageIndex];
    let cancelled = false;

    const setup = async () => {
      // Unregister all first, then guard against stale runs
      try { await unregisterAll(); } catch {}
      if (cancelled) return;

      const entries = Object.entries(page?.keys ?? {});
      for (const [keyId, binding] of entries) {
        if (cancelled) break;
        const action = (binding as { action: Action | null }).action;
        if (!action) continue;
        const shortcut = keyIdToShortcut(keyId);
        // Capture action value for the callback closure
        const capturedAction = action;
        const handler = makeDebounced(async () => {
          if (capturedAction.type === "builtin") {
            const feature = (capturedAction as BuiltinAction).feature;
            invoke(builtinToggleCommand(feature)).catch((e) => {
              console.error("builtin shortcut failed:", e);
              if (feature === "screenshot") {
                window.alert(`截图失败：${String(e)}`);
              }
            });
            return;
          }
          invoke("execute_action", { action: capturedAction }).catch(console.error);
        });
        try {
          await registerShortcut(shortcut, handler);
        } catch (err) {
          console.warn(`Global shortcut ${shortcut} unavailable:`, err);
        }
      }

      if (!cancelled) {
        try {
          await registerShortcut(
            GLOBAL_SHORTCUTS.keyboard,
            makeDebounced(async () => {
              const win = getCurrentWindow();
              if (await win.isVisible()) {
                const position = await win.outerPosition();
                setStoredEntryPosition("main", { x: position.x, y: position.y });
                win.hide().catch(() => {});
              } else {
                invoke("show_keyboard_window", {
                  position: getStoredEntryPosition("main"),
                }).catch(console.error);
              }
            })
          );
        } catch (err) {
          console.warn(`${GLOBAL_SHORTCUTS.keyboard} shortcut unavailable:`, err);
        }
      }

      if (!cancelled) {
        try {
          await registerShortcut(
            GLOBAL_SHORTCUTS.clipboard,
            makeDebounced(async () => {
              invoke("show_clipboard_window").catch(console.error);
            })
          );
        } catch (err) {
          console.warn(`${GLOBAL_SHORTCUTS.clipboard} shortcut unavailable:`, err);
        }
      }

      if (!cancelled) {
        try {
          await registerShortcut(
            GLOBAL_SHORTCUTS.search,
            makeDebounced(async () => {
              invoke("show_search_window").catch(console.error);
            })
          );
        } catch (err) {
          console.warn(`${GLOBAL_SHORTCUTS.search} search shortcut unavailable:`, err);
        }
      }

      if (!cancelled) {
        try {
          await registerShortcut(
            GLOBAL_SHORTCUTS.pet,
            makeDebounced(async () => {
              invoke("show_pet_window", {
                position: getStoredEntryPosition("pet"),
              }).catch(console.error);
            })
          );
        } catch (err) {
          console.warn(`${GLOBAL_SHORTCUTS.pet} pet shortcut unavailable:`, err);
        }
      }
    };

    setup();
    return () => {
      cancelled = true;
      unregisterAll().catch(() => {});
    };
  }, [config, activePageIndex]);

  // Persist config helper
  const persistConfig = useCallback(() => {
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  }, []);

  // Close tab context menu on outside click
  useEffect(() => {
    if (!tabMenu) return;
    const handler = (e: MouseEvent) => {
      if (tabMenuRef.current && !tabMenuRef.current.contains(e.target as Node)) {
        setTabMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tabMenu]);

  // Save binding
  const handleBindingSave = useCallback(async (action: Action) => {
    if (!bindingKey) return;
    bindKey(activePageIndex, bindingKey, action);
    setBindingKey(null);
    // Persist after state settles
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  }, [bindingKey, activePageIndex, bindKey]);

  // Clear binding
  const handleBindingClear = useCallback(async () => {
    if (!bindingKey) return;
    bindKey(activePageIndex, bindingKey, null);
    setBindingKey(null);
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  }, [bindingKey, activePageIndex, bindKey]);

  const activePage = config?.pages[activePageIndex];

  const saveCurrentWindowPosition = useCallback(async (mode: "main" | "pet") => {
    const position = await getCurrentWindow().outerPosition();
    setStoredEntryPosition(mode, { x: position.x, y: position.y });
    return position;
  }, []);

  const playSwitchToPetTimeline = useCallback(() => {
    const panel = rootPanelRef.current;
    const petButton = petModeButtonRef.current;
    const duration = reducedMotion ? 0 : motionDuration.playful;

    if (!panel) return duration;

    gsap.timeline({ defaults: { overwrite: "auto" } })
      .to(petButton, {
        scale: reducedMotion ? 1 : 1.12,
        rotation: reducedMotion ? 0 : -8,
        filter: reducedMotion ? "none" : "brightness(1.22) saturate(1.22)",
        duration: reducedMotion ? 0 : motionDuration.panel,
        ease: motionEase.enter,
      }, 0)
      .to(panel, {
        autoAlpha: 0,
        y: reducedMotion ? 0 : 10,
        scale: reducedMotion ? 1 : 0.9,
        borderRadius: reducedMotion ? 16 : 34,
        filter: reducedMotion ? "none" : "blur(1.4px) saturate(1.08) brightness(0.78)",
        duration,
        ease: reducedMotion ? motionEase.standard : motionEase.morph,
      }, 0);

    return duration;
  }, [reducedMotion]);

  const switchToPetMode = useCallback(async () => {
    if (modeTransition !== "idle") return;
    setModeTransition("to-pet");
    try {
      const mainPosition = await saveCurrentWindowPosition("main");
      const petPosition = getStoredEntryPosition("pet") ?? {
        x: mainPosition.x + MAIN_WINDOW_WIDTH + 24,
        y: mainPosition.y + Math.round((MAIN_WINDOW_HEIGHT - PET_WINDOW_SIZE) / 2),
      };
      setStoredEntryPosition("pet", petPosition);
      const durationMs = Math.round(playSwitchToPetTimeline() * 1000);
      window.setTimeout(() => {
        window.localStorage.setItem(PET_RETURN_ANIMATION_KEY, "1");
        invoke("switch_to_pet_mode", { position: petPosition })
          .catch((error) => {
            window.localStorage.removeItem(PET_RETURN_ANIMATION_KEY);
            console.error(error);
            resetKeyboardPanelVisualState();
          })
          .finally(() => setModeTransition("idle"));
      }, durationMs);
    } catch (error) {
      console.error(error);
      resetKeyboardPanelVisualState();
      setModeTransition("idle");
    }
  }, [modeTransition, playSwitchToPetTimeline, resetKeyboardPanelVisualState, saveCurrentWindowPosition]);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      {/* Glass panel */}
      <div
        ref={rootPanelRef}
        className="glass entry-mode-shell"
        style={{
          width: 900, borderRadius: 16,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          backgroundColor: hexToRgba(theme.bgColor, theme.bgOpacity),
          background: launcherShellBackground(theme),
          backdropFilter: `blur(${theme.blurRadius}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${theme.blurRadius}px) saturate(180%)`,
          border: `1px solid ${theme.borderColor}`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 20px 48px rgba(0,0,0,0.28)",
          position: "relative",
        }}
      >
        {/* Header */}
        <div
          data-tauri-drag-region
          style={{
            height: 50,
            flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px 9px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.075)",
            cursor: "move",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              ref={petModeButtonRef}
              onClick={() => switchToPetMode().catch(console.error)}
              title="Pet mode"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.13)",
                background: modeTransition === "to-pet"
                  ? "rgba(243,201,139,0.18)"
                  : "linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025))",
                boxShadow: modeTransition === "to-pet"
                  ? "0 0 18px rgba(243,201,139,0.28)"
                  : "inset 0 1px 0 rgba(255,255,255,0.15), 0 6px 15px rgba(0,0,0,0.28)",
                cursor: modeTransition === "idle" ? "pointer" : "default",
                padding: 0,
                display: "grid",
                placeItems: "center",
                transition: "background 180ms ease, box-shadow 180ms ease",
              }}
              type="button"
              disabled={modeTransition !== "idle"}
              data-tauri-drag-region="false"
            >
              <PixelPetIcon size={18} decorative />
            </button>
            <span style={{ fontSize: 12, fontWeight: 650, color: "rgba(255,255,255,0.86)", letterSpacing: 0, pointerEvents: "none" }}>
              DevLauncher
            </span>
            <span style={{ width: 1, height: 13, background: "rgba(255,255,255,0.2)", display: "inline-block" }} />
            <span style={{ color: "rgba(222,227,238,0.58)", fontSize: 10, fontWeight: 500, letterSpacing: 0, pointerEvents: "none" }}>
              {"\u4e00\u952e\u542f\u52a8\u4f60\u7684\u5f00\u53d1\u5de5\u4f5c\u6d41"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <button
              onClick={() => invoke("show_search_window").catch(console.error)}
              style={{
                width: 94,
                height: 30,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.09)",
                background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.035))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 13px rgba(0,0,0,0.22)",
                color: "rgba(241,244,252,0.76)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 500,
              }}
              title="Search"
              type="button"
              data-tauri-drag-region="false"
            >
              <SearchIcon size={13} decorative />
              <span>{"\u641c\u7d22"}</span>
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                width: 32,
                height: 30,
                borderRadius: 8,
                background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.035))",
                border: "1px solid rgba(255,255,255,0.09)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 13px rgba(0,0,0,0.22)",
                cursor: "pointer",
                padding: 0,
                outline: "none",
                display: "grid",
                placeItems: "center",
                color: "rgba(239,243,255,0.75)",
                transition: "background-color 180ms ease, border-color 180ms ease, color 180ms ease",
              }}
              title="Settings"
              type="button"
              data-tauri-drag-region="false"
            >
              <SettingsIcon size={17} decorative />
            </button>
            <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.2)", opacity: 0.35 }} />
            <MacWindowControls
              onClose={() => getCurrentWindow().hide()}
              onMinimize={() => getCurrentWindow().minimize()}
              closeTitle="Hide to tray"
              minimizeTitle="Minimize"
            />
          </div>
        </div>
        {config && (
          <div style={{
            height: 37,
            display: "flex", alignItems: "flex-end", gap: 18,
            padding: "0 0 0 13px", flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            overflowX: "auto",
          }}>
            {config.pages.map((page, i) => {
              const isActive = i === activePageIndex;
              const isEditing = editingTabIndex === i;
              return (
                <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => {
                        const n = editingName.trim();
                        if (n) { renamePage(i, n); persistConfig(); }
                        setEditingTabIndex(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") { setEditingTabIndex(null); }
                        e.stopPropagation();
                      }}
                      style={{
                        height: 29,
                        padding: "0 17px",
                        minWidth: 60,
                        width: Math.max(60, editingName.length * 10),
                        borderRadius: "6px 6px 0 0",
                        border: "none",
                        borderBottom: "3px solid #3f90ff",
                        background: "rgba(255,255,255,0.15)",
                        color: "rgba(255,255,255,0.95)",
                        fontSize: 12, fontWeight: 560, outline: "none",
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setActivePageIndex(i)}
                      onDoubleClick={() => { setEditingTabIndex(i); setEditingName(page.name); }}
                      onContextMenu={e => {
                        e.preventDefault();
                        setTabMenu({ index: i, x: e.clientX, y: e.clientY });
                      }}
                      style={{
                        height: 29,
                        minWidth: 60,
                        padding: "0 17px",
                        borderRadius: "6px 6px 0 0",
                        border: isActive ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
                        borderBottom: isActive ? "3px solid #3f90ff" : "3px solid transparent",
                        cursor: "pointer",
                        fontSize: 12, fontWeight: 560,
                        background: isActive ? "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))" : "transparent",
                        color: isActive ? "#fbfcff" : "rgba(228,232,242,0.62)",
                        boxShadow: isActive ? "inset 0 1px 0 rgba(255,255,255,0.09), 0 7px 16px rgba(0,0,0,0.18)" : "none",
                        transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease", whiteSpace: "nowrap",
                      }}
                    >
                      {page.name}
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add page button */}
            <button
              onClick={() => {
                const name = `Page ${config.pages.length + 1}`;
                addPage(name);
                persistConfig();
              }}
              title="Add page"
              style={{
                width: 27, height: 29, borderRadius: 8, flexShrink: 0,
                border: "1px solid rgba(255,255,255,0.09)",
                background: "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.035))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 13px rgba(0,0,0,0.22)",
                color: "rgba(247,249,255,0.92)", fontSize: 17, lineHeight: 1,
                cursor: "pointer", marginBottom: 4, outline: "none",
                display: "grid", placeItems: "center",
                transition: "border-color 120ms ease, color 120ms ease, background-color 120ms ease",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.5)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.22)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"; }}
            >
              <AddIcon size={14} decorative />
            </button>
          </div>
        )}

        {/* Tab context menu */}
        {tabMenu && config && (
          <div
            ref={tabMenuRef}
            style={{
              position: "fixed",
              left: tabMenu.x, top: tabMenu.y,
              zIndex: 2000,
              background: "rgba(24,26,42,0.98)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              overflow: "hidden", minWidth: 120,
            }}
          >
            {[
              {
                label: "Rename", icon: <RenameIcon size={14} decorative />,
                action: () => { setEditingTabIndex(tabMenu.index); setEditingName(config.pages[tabMenu.index].name); setTabMenu(null); }
              },
              ...(config.pages.length > 1 ? [{
                label: "Delete page", icon: <DeleteIcon size={14} decorative />,
                action: () => {
                  const pageName = config.pages[tabMenu.index]?.name ?? "this page";
                  if (!window.confirm(`Delete page "${pageName}"? This will remove all bindings on this page.`)) return;
                  removePage(tabMenu.index);
                  persistConfig();
                  setTabMenu(null);
                }, danger: true,
              }] : []),
            ].map(item => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "8px 14px",
                  background: "transparent", border: "none", cursor: "pointer",
                  fontSize: 12, color: (item as { danger?: boolean }).danger ? "rgba(239,68,68,0.85)" : "rgba(255,255,255,0.78)",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={{ display: "inline-flex", width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Keyboard area */}
        <div style={{ padding: "22px 40px 34px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "40px 0", fontSize: 13 }}>
              {"Loading..."}
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", color: "rgba(248,113,113,0.86)", padding: "32px 24px", fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{"Load config failed"}</div>
              <div style={{ color: "rgba(255,255,255,0.48)", wordBreak: "break-word" }}>{error}</div>
              <div style={{ color: "rgba(255,255,255,0.34)", marginTop: 8 }}>
                {"DevLauncher main window needs the Tauri desktop runtime. Opening localhost directly only shows the frontend shell."}
              </div>
            </div>
          ) : !config ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "40px 0", fontSize: 13 }}>
              {"No config"}
            </div>
          ) : config.pages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>{"No page config"}</div>
              <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 11, marginTop: 6 }}>
                {"Edit keyboard.yaml to add pages"}
              </div>
            </div>
          ) : (
            <KeyboardPanel
              keys={activePage?.keys ?? {}}
              onKeyClick={handleKeyClick}
              onKeyBind={(keyId) => setBindingKey(keyId)}
            />
          )}
        </div>

      </div>

      {/* Settings modal */}
      {showSettings && (
        <div
          className="motion-dialog"
          style={{
            position: "fixed", inset: 0,
            zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "auto",
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            ref={settingsDialogRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 760, maxWidth: "92vw", height: "min(640px, 90vh)", maxHeight: "90vh",
              borderRadius: 14,
              background: hexToRgba(theme.bgColor, Math.min(theme.bgOpacity + 0.1, 1)),
              backdropFilter: `blur(${theme.blurRadius}px) saturate(180%)`,
              WebkitBackdropFilter: `blur(${theme.blurRadius}px) saturate(180%)`,
              border: `1px solid ${theme.borderColor}`,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
              pointerEvents: "auto",
            }}
          >
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {/* Binding modal */}
      {bindingKey && (
        <BindingModal
          keyId={bindingKey}
          initialAction={activePage?.keys[bindingKey]?.action}
          onClose={() => setBindingKey(null)}
          onSave={handleBindingSave}
          onClear={handleBindingClear}
        />
      )}
    </div>
  );
}
