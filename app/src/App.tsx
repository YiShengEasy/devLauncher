import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { register as registerShortcut, unregister as unregisterShortcut } from "@tauri-apps/plugin-global-shortcut";
import gsap from "gsap";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { loadConfig, saveConfig } from "@/api/config";
import { KeyboardPanel } from "@/components/KeyboardPanel";
import { BindingModal } from "@/components/BindingModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsPanel } from "@/components/SettingsPanel";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { MacWindowControls } from "@/components/MacWindowControls";
import { hideMainWindowToTray, minimizeMainWindow } from "@/mainWindowControl";
import type { Action, KeyId, KeyboardConfig, ThemeConfig } from "@/types/actions";
import { AddIcon, DeleteIcon, RenameIcon, SettingsIcon, WorkflowIcon } from "@/icons";
import { SearchIcon } from "@/icons/entryIcons";
import { executeAction } from "@/launcher/actionExecutor";
import { animateDialogEnter, animatePanelEnter } from "@/motion/presets";
import { motionDuration, motionEase } from "@/motion/tokens";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { getGlobalShortcuts, isMacPlatform, keyIdToShortcut } from "@/platform/shortcuts";
import {
  dismissPermissionFeatureForSession,
  getPermissionHealthIssue,
  markPermissionFeatureUsed,
  openPermissionSettings,
  recordConfiguredPermissionFeatures,
  type PermissionHealthIssue,
} from "@/permissions/permissionHealth";
import { listInstalledPlugins } from "@/plugins/api";
import { pluginIconSrc } from "@/plugins/registry";
import "./index.css";

const KEYBOARD_RETURN_ANIMATION_KEY = "devlauncher:keyboard-return-animation";
const PET_ACTION_STATE_KEY = "devlauncher:pet-action-state";
const GLOBAL_SHORTCUTS = getGlobalShortcuts();

function setPetActionState(action: "cozy" | "keyboardJump") {
  window.localStorage.setItem(PET_ACTION_STATE_KEY, action);
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
      hexToRgba(theme.bgColor, theme.bgOpacity),
    ].join(", ");
  }

  if (isAurora) {
    return [
      "linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px) 0 0 / 39px 39px",
      "linear-gradient(0deg, rgba(255,255,255,0.008) 1px, transparent 1px) 0 0 / 39px 39px",
      "radial-gradient(circle at 88% 13%, rgba(205,89,84,0.24), transparent 22%)",
      "radial-gradient(circle at 66% 8%, rgba(94,73,178,0.28), transparent 30%)",
      "radial-gradient(circle at 11% 96%, rgba(116,58,128,0.42), transparent 28%)",
      hexToRgba(theme.bgColor, theme.bgOpacity),
    ].join(", ");
  }

  return [
    "linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px) 0 0 / 39px 39px",
    "linear-gradient(0deg, rgba(255,255,255,0.008) 1px, transparent 1px) 0 0 / 39px 39px",
    "radial-gradient(circle at 98% 29%, rgba(160,70,70,0.18), transparent 18%)",
    "radial-gradient(circle at 18% 4%, rgba(43,55,131,0.22), transparent 30%)",
    "radial-gradient(circle at 8% 96%, rgba(113,58,77,0.47), transparent 24%)",
    hexToRgba(theme.bgColor, theme.bgOpacity),
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
    addPage, renamePage, removePage,
    showSettings, setShowSettings, theme,
  } = useKeyboardStore();

  const [bindingKey, setBindingKey] = useState<KeyId | null>(null);
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [permissionIssue, setPermissionIssue] = useState<PermissionHealthIssue | null>(null);
  // Tab editing state
  const [editingTabIndex, setEditingTabIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [tabMenu, setTabMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);
  const rootPanelRef = useRef<HTMLDivElement>(null);
  const settingsDialogRef = useRef<HTMLDivElement>(null);
  const workflowDialogRef = useRef<HTMLDivElement>(null);
  const petModeButtonRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const registeredFrontendShortcutsRef = useRef<string[]>([]);
  const noticeTimerRef = useRef<number | null>(null);

  const showNotice = useCallback((message: string, tone: "error" | "success" = "error") => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice({ message, tone });
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 4200);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

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
  }, [playKeyboardReturnTimeline, resetKeyboardPanelVisualState]);

  useGsapContext(settingsDialogRef, () => {
    if (!showSettings || !settingsDialogRef.current) return;
    animateDialogEnter(settingsDialogRef.current, reducedMotion);
  }, [showSettings, reducedMotion]);

  useGsapContext(workflowDialogRef, () => {
    if (!showWorkflows || !workflowDialogRef.current) return;
    animateDialogEnter(workflowDialogRef.current, reducedMotion);
  }, [showWorkflows, reducedMotion]);

  useEffect(() => {
    if (!showWorkflows) return;
    invoke("set_workflow_workspace_mode", { enabled: true }).catch(console.error);
    loadConfig()
      .then((nextConfig) => useKeyboardStore.getState().setConfig(nextConfig))
      .catch(console.error);
    return () => {
      invoke("set_workflow_workspace_mode", { enabled: false }).catch(console.error);
    };
  }, [showWorkflows]);

  useEffect(() => {
    if (!bindingKey) return;
    invoke("set_binding_workspace_mode", { enabled: true }).catch(console.error);
    return () => {
      invoke("set_binding_workspace_mode", { enabled: false }).catch(console.error);
    };
  }, [bindingKey]);

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

  const refreshPluginIcons = useCallback(async () => {
    try {
      const plugins = await listInstalledPlugins();
      const icons = Object.fromEntries(
        plugins
          .filter((plugin) => plugin.enabled)
          .map((plugin) => [plugin.id, pluginIconSrc(plugin.iconPath)])
          .filter((entry): entry is [string, string] => Boolean(entry[1])),
      );
      useKeyboardStore.getState().setPluginIcons(icons);
    } catch (e) {
      console.warn("[DevLauncher] listInstalledPlugins failed:", e);
      useKeyboardStore.getState().setPluginIcons({});
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

  // Project Tasks saves workflows from a separate Tauri window. Refresh the
  // in-memory config before the user binds a key, otherwise a later binding
  // save could overwrite the workflow that was just discovered.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("projecttasks-workflow-saved", async () => {
      try {
        const nextConfig = await loadConfig();
        const current = useKeyboardStore.getState();
        useKeyboardStore.setState({ config: nextConfig, theme: nextConfig.theme ?? current.theme });
        showNotice("已同步项目任务工作流", "success");
      } catch (error) {
        showNotice(`同步项目任务失败：${String(error)}`);
      }
    }).then((dispose) => {
      unlisten = dispose;
    }).catch(console.error);
    return () => {
      unlisten?.();
    };
  }, [showNotice]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    refreshPluginIcons();
    listen("plugins-changed", () => {
      refreshPluginIcons();
    }).then((fn) => {
      unlisten = fn;
    }).catch(console.error);
    return () => {
      unlisten?.();
    };
  }, [refreshPluginIcons]);

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

  useEffect(() => {
    recordConfiguredPermissionFeatures(config);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      getPermissionHealthIssue()
        .then((issue) => {
          if (!cancelled) setPermissionIssue(issue);
        })
        .catch((err) => {
          console.warn("permission health check failed", err);
        });
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [config]);

  const refreshPermissionIssue = useCallback(async () => {
    try {
      setPermissionIssue(await getPermissionHealthIssue());
    } catch (err) {
      console.warn("permission health refresh failed", err);
    }
  }, []);

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

    try {
      if (action.type === "builtin" && action.feature === "screenshot") {
        markPermissionFeatureUsed("screenshot");
      }
      await executeAction(action, { invoke });
      if (action.type === "builtin" && action.feature === "screenshot") {
        void refreshPermissionIssue();
      }
    } catch (e) {
      console.error("action execution failed:", e);
      if (action.type === "builtin" && action.feature === "screenshot") {
        void refreshPermissionIssue();
        showNotice(`截图失败：${String(e)}`);
      } else {
        showNotice(`执行失败：${String(e)}`);
      }
    }
  }, [config, activePageIndex, refreshPermissionIssue, showNotice]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.repeat
        || event.isComposing
        || event.metaKey
        || event.ctrlKey
        || event.altKey
        || showSettings
        || showWorkflows
        || bindingKey
        || confirmRequest
      ) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable
        || target?.closest("input, textarea, select, [contenteditable='true']")
      ) return;

      const normalizedKey = event.key.toUpperCase();
      if (!/^[A-Z0-9]$/.test(normalizedKey)) return;
      const keyId = normalizedKey as KeyId;

      const state = useKeyboardStore.getState();
      const action = state.config?.pages[state.activePageIndex]?.keys[keyId]?.action;
      if (!action) return;

      event.preventDefault();
      void handleKeyClick(keyId);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindingKey, confirmRequest, handleKeyClick, showSettings, showWorkflows]);

  useEffect(() => {
    const focusKeyboardPanel = () => {
      if (showSettings || showWorkflows || bindingKey || confirmRequest) return;
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement?.closest("input, textarea, select, [contenteditable='true']")) return;
      window.requestAnimationFrame(() => {
        rootPanelRef.current?.focus({ preventScroll: true });
      });
    };

    window.addEventListener("focus", focusKeyboardPanel);
    if (document.hasFocus()) focusKeyboardPanel();
    return () => window.removeEventListener("focus", focusKeyboardPanel);
  }, [bindingKey, confirmRequest, showSettings, showWorkflows]);

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
      const unavailableShortcuts: string[] = [];
      const previousShortcuts = registeredFrontendShortcutsRef.current;
      registeredFrontendShortcutsRef.current = [];
      if (previousShortcuts.length > 0) {
        try { await unregisterShortcut(previousShortcuts); } catch {}
      }
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
          if (capturedAction.type === "builtin" && capturedAction.feature === "screenshot") {
            markPermissionFeatureUsed("screenshot");
          }
          const execution = capturedAction.type === "builtin" && capturedAction.feature === "screenshot"
            ? invoke("show_screenshot_window")
            : executeAction(capturedAction, { invoke });
          execution.catch((e) => {
            console.error("shortcut action failed:", e);
            if (capturedAction.type === "builtin" && capturedAction.feature === "screenshot") {
              void refreshPermissionIssue();
              showNotice(`截图失败：${String(e)}`);
            } else {
              showNotice(`执行失败：${String(e)}`);
            }
          });
          if (capturedAction.type === "builtin" && capturedAction.feature === "screenshot") {
            void refreshPermissionIssue();
          }
        });
        try {
          await registerShortcut(shortcut, handler);
          registeredFrontendShortcutsRef.current = [...registeredFrontendShortcutsRef.current, shortcut];
        } catch (err) {
          console.warn(`Global shortcut ${shortcut} unavailable:`, err);
          unavailableShortcuts.push(`${keyId} (${shortcut})`);
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
          registeredFrontendShortcutsRef.current = [...registeredFrontendShortcutsRef.current, GLOBAL_SHORTCUTS.clipboard];
        } catch (err) {
          console.warn(`${GLOBAL_SHORTCUTS.clipboard} shortcut unavailable:`, err);
          unavailableShortcuts.push(`剪贴板 (${GLOBAL_SHORTCUTS.clipboard})`);
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
          registeredFrontendShortcutsRef.current = [...registeredFrontendShortcutsRef.current, GLOBAL_SHORTCUTS.search];
        } catch (err) {
          console.warn(`${GLOBAL_SHORTCUTS.search} search shortcut unavailable:`, err);
          unavailableShortcuts.push(`搜索 (${GLOBAL_SHORTCUTS.search})`);
        }
      }

      if (!cancelled && unavailableShortcuts.length > 0) {
        showNotice(`快捷键被系统或其他应用占用：${unavailableShortcuts.join("、")}`);
      }

    };

    setup();
    return () => {
      cancelled = true;
      const shortcuts = registeredFrontendShortcutsRef.current;
      registeredFrontendShortcutsRef.current = [];
      if (shortcuts.length > 0) unregisterShortcut(shortcuts).catch(() => {});
    };
  }, [config, activePageIndex, refreshPermissionIssue, showNotice]);

  // Persist config helper
  const persistConfig = useCallback(() => {
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  }, []);

  const handleWorkflowConfigSave = useCallback(async (nextConfig: KeyboardConfig) => {
    const latestConfig = await loadConfig();
    const expectedRevision = Math.max(0, (nextConfig.revision ?? 0) - 1);
    if ((latestConfig.revision ?? 0) !== expectedRevision) {
      useKeyboardStore.setState({ config: latestConfig });
      throw new Error("工作流已被 MCP 或其他窗口更新，已载入最新配置，请确认后重试。");
    }
    useKeyboardStore.setState({ config: nextConfig });
    await saveConfig(nextConfig);
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
  const persistBinding = useCallback(async (action: Action | null) => {
    if (!bindingKey) return;
    try {
      const latestConfig = await loadConfig();
      const page = latestConfig.pages[activePageIndex];
      if (!page) throw new Error("当前键盘页面不存在");
      const pages = latestConfig.pages.map((item, index) => index === activePageIndex
        ? {
            ...item,
            keys: {
              ...item.keys,
              [bindingKey]: { action },
            },
          }
        : item);
      const nextConfig = {
        ...latestConfig,
        revision: (latestConfig.revision ?? 0) + 1,
        pages,
      };
      useKeyboardStore.setState({ config: nextConfig, theme: nextConfig.theme });
      await saveConfig(nextConfig);
      setBindingKey(null);
    } catch (error) {
      showNotice(`保存绑定失败：${String(error)}`);
    }
  }, [bindingKey, activePageIndex, showNotice]);

  const handleBindingSave = useCallback((action: Action) => {
    void persistBinding(action);
  }, [persistBinding]);

  // Clear binding
  const handleBindingClear = useCallback(() => {
    void persistBinding(null);
  }, [persistBinding]);

  const activePage = config?.pages[activePageIndex];

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      {/* Glass panel */}
      <div
        ref={rootPanelRef}
        tabIndex={-1}
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
          boxShadow: "var(--theme-window-shadow, 0 2px 8px rgba(0,0,0,0.10))",
          position: "relative",
          outline: "none",
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
          <div data-tauri-drag-region style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <button
              ref={petModeButtonRef}
              title="Keyboard mode"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.13)",
                background: "linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 6px 15px rgba(0,0,0,0.28)",
                cursor: "default",
                padding: 0,
                display: "grid",
                placeItems: "center",
                transition: "background 180ms ease, box-shadow 180ms ease",
              }}
              type="button"
              tabIndex={-1}
              data-tauri-drag-region
            >
              <img
                data-tauri-drag-region
                src="/devlauncher-icon.png"
                alt=""
                draggable={false}
                style={{
                  width: 21,
                  height: 21,
                  display: "block",
                  borderRadius: 6,
                  objectFit: "cover",
                }}
              />
            </button>
            <span data-tauri-drag-region style={{ fontSize: 12, fontWeight: 650, color: "rgba(255,255,255,0.86)", letterSpacing: 0, pointerEvents: "none" }}>
              DevLauncher
            </span>
            <span data-tauri-drag-region style={{ width: 1, height: 13, background: "rgba(255,255,255,0.2)", display: "inline-block" }} />
            <span data-tauri-drag-region style={{ color: "rgba(222,227,238,0.58)", fontSize: 10, fontWeight: 500, letterSpacing: 0, pointerEvents: "none" }}>
              {"\u4e00\u952e\u542f\u52a8\u4f60\u7684\u5f00\u53d1\u5de5\u4f5c\u6d41"}
            </span>
            <span
              data-tauri-drag-region
              style={{
                color: "rgba(222,227,238,0.5)",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: 0,
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              {isMacPlatform()
                ? "双击 Ctrl 唤起 · 单按字母/数字执行 · ⌘⌥ + 字母/数字后台执行"
                : "双击 Ctrl 唤起 · 单按字母/数字执行 · Alt + 字母/数字后台执行"}
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
              onClick={() => {
                setShowSettings(false);
                setShowWorkflows((show) => !show);
              }}
              style={{
                width: 32,
                height: 30,
                borderRadius: 8,
                background: showWorkflows
                  ? "rgba(96,165,250,0.18)"
                  : "linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.035))",
                border: showWorkflows
                  ? "1px solid rgba(96,165,250,0.36)"
                  : "1px solid rgba(255,255,255,0.09)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 13px rgba(0,0,0,0.22)",
                cursor: "pointer",
                padding: 0,
                outline: "none",
                display: "grid",
                placeItems: "center",
                color: "rgba(239,243,255,0.75)",
              }}
              title="工作流编排器"
              aria-label="打开工作流编排器"
              type="button"
              data-tauri-drag-region="false"
            >
              <WorkflowIcon size={17} decorative />
            </button>
            <button
              onClick={() => {
                setShowWorkflows(false);
                setShowSettings(!showSettings);
              }}
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
              onClose={() => {
                setPetActionState("cozy");
                hideMainWindowToTray().catch(console.error);
              }}
              onMinimize={() => {
                setPetActionState("cozy");
                minimizeMainWindow().catch(console.error);
              }}
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
            className="theme-popover-surface"
            style={{
              position: "fixed",
              left: tabMenu.x, top: tabMenu.y,
              zIndex: 2000,
              background: "var(--theme-bg, rgba(24,26,42,0.98))",
              border: "1px solid var(--theme-border, rgba(255,255,255,0.14))",
              borderRadius: 8,
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
                  const pageIndex = tabMenu.index;
                  setTabMenu(null);
                  setConfirmRequest({
                    title: "删除页面",
                    message: `将删除“${pageName}”及其中的全部按键绑定。此操作无法撤销。`,
                    confirmLabel: "删除页面",
                    onConfirm: () => {
                      removePage(pageIndex);
                      persistConfig();
                      setConfirmRequest(null);
                      showNotice("页面已删除。", "success");
                    },
                  });
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
          {permissionIssue && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(251,191,36,0.26)",
                background: "rgba(120,73,15,0.18)",
                color: "rgba(255,244,210,0.92)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{permissionIssue.title}</div>
                <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.45, color: "rgba(255,244,210,0.68)" }}>
                  {permissionIssue.description}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => {
                    void openPermissionSettings(permissionIssue.permission);
                  }}
                  style={{
                    border: "1px solid rgba(251,191,36,0.34)",
                    background: "rgba(251,191,36,0.16)",
                    color: "rgba(255,244,210,0.96)",
                    borderRadius: 8,
                    padding: "6px 9px",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  去修复
                </button>
                <button
                  onClick={() => void refreshPermissionIssue()}
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.76)",
                    borderRadius: 8,
                    padding: "6px 9px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  重新检测
                </button>
                <button
                  onClick={() => {
                    dismissPermissionFeatureForSession(permissionIssue.feature);
                    setPermissionIssue(null);
                  }}
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.5)",
                    borderRadius: 8,
                    padding: "6px 9px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  稍后
                </button>
              </div>
            </div>
          )}
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
          className="theme-modal-backdrop"
          style={{
            position: "fixed", inset: 0,
            zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "auto",
            background: "rgba(3,7,18,0.48)",
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            ref={settingsDialogRef}
            className="motion-dialog theme-dialog-surface"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 760, maxWidth: "92vw", height: "min(640px, 90vh)", maxHeight: "90vh",
              borderRadius: 14,
              background: hexToRgba(theme.bgColor, theme.bgOpacity),
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

      {showWorkflows && config && (
        <div
          className="theme-modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
            background: "transparent",
          }}
          onClick={() => setShowWorkflows(false)}
        >
          <div
            ref={workflowDialogRef}
            className="motion-dialog theme-dialog-surface"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "calc(100vw - 24px)",
              maxWidth: "calc(100vw - 24px)",
              height: "calc(100vh - 24px)",
              maxHeight: "calc(100vh - 24px)",
              borderRadius: 14,
              background: hexToRgba(theme.bgColor, theme.bgOpacity),
              border: `1px solid ${theme.borderColor}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              clipPath: "inset(0 round 14px)",
              isolation: "isolate",
              pointerEvents: "auto",
            }}
          >
            <WorkflowPanel
              config={config}
              onSaveConfig={handleWorkflowConfigSave}
              onClose={() => setShowWorkflows(false)}
            />
          </div>
        </div>
      )}

      {/* Binding modal */}
      {bindingKey && (
        <BindingModal
          keyId={bindingKey}
          initialAction={activePage?.keys[bindingKey]?.action}
          workflows={config?.workflows ?? []}
          onClose={() => setBindingKey(null)}
          onSave={handleBindingSave}
          onClear={handleBindingClear}
        />
      )}
      {confirmRequest && (
        <ConfirmDialog
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmLabel={confirmRequest.confirmLabel}
          onConfirm={confirmRequest.onConfirm}
          onCancel={() => setConfirmRequest(null)}
        />
      )}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 22,
            zIndex: 2500,
            maxWidth: "min(520px, calc(100vw - 32px))",
            transform: "translateX(-50%)",
            padding: "9px 13px",
            borderRadius: 8,
            border: notice.tone === "error"
              ? "1px solid rgba(248,113,113,0.36)"
              : "1px solid rgba(74,222,128,0.34)",
            background: notice.tone === "error"
              ? "rgba(69,10,10,0.94)"
              : "rgba(6,78,59,0.94)",
            boxShadow: "none",
            color: "rgba(255,255,255,0.9)",
            fontSize: 12,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {notice.message}
        </div>
      )}
    </div>
  );
}
