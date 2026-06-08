import { useEffect, useState, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { register as registerShortcut, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { loadConfig, saveConfig } from "@/api/config";
import { KeyboardPanel } from "@/components/KeyboardPanel";
import { BindingModal } from "@/components/BindingModal";
import { SettingsPanel } from "@/components/SettingsPanel";
import type { Action, KeyId, BuiltinAction, KeyboardConfig } from "@/types/actions";
import "./index.css";

// Convert KeyId → global shortcut string (hotkey crate format)
function keyIdToShortcut(keyId: string): string {
  if (/^\d$/.test(keyId)) return `Alt+Digit${keyId}`;
  return `Alt+Key${keyId}`;
}

// Hex → rgba helper
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
    setConfig, setLoading, setError, setActivePageIndex,
    bindKey, addPage, renamePage, removePage,
    showSettings, setShowSettings, theme,
  } = useKeyboardStore();

  const [bindingKey, setBindingKey] = useState<KeyId | null>(null);

  // Tab editing state
  const [editingTabIndex, setEditingTabIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [tabMenu, setTabMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);

  // Extract app icons from .exe files — defined BEFORE the effects that call it
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

  // Load config on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const cfg = await loadConfig();
        setConfig(cfg);
        // Extract app icons in background
        // Note: also triggered by config-watcher effect below
        extractAllAppIcons(cfg);
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
    extractAllAppIcons(config);
  }, [config]);

  // Inject theme as CSS custom properties so any panel can read them
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--theme-bg", hexToRgba(theme.bgColor, theme.bgOpacity));
    r.setProperty("--theme-blur", `${theme.blurRadius}px`);
    r.setProperty("--theme-border", theme.borderColor);
    r.setProperty("--theme-bg-solid", theme.bgColor);
  }, [theme]);
  // Extract app icons from .exe files — MOVED above, before first useEffect

  // Execute action on key click
  const handleKeyClick = useCallback(async (keyId: KeyId) => {
    const page = config?.pages[activePageIndex];
    const action = page?.keys[keyId]?.action;
    if (!action) return;
    // Handle builtin actions locally
    if (action.type === "builtin") {
      const b = action as BuiltinAction;
      if (b.feature === "clipboard") {
        invoke("toggle_clipboard_window").catch(console.error);
      } else if (b.feature === "json") {
        invoke("toggle_json_helper_window").catch(console.error);
      } else if (b.feature === "totp") {
        invoke("toggle_totp_window").catch(console.error);
      } else if (b.feature === "remotedesk") {
        invoke("toggle_remotedesk_window").catch(console.error);
      }
      return;
    }
    try {
      await invoke("execute_action", { action });
    } catch (e) {
      console.error("execute_action failed:", e);
    }
  }, [config, activePageIndex]);

  // ── Tab key: cycle pages when window focused (not inside an input) ──
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

  // ── Global Alt+key shortcuts + Ctrl+Shift+V ──
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
          if (capturedAction.type === "builtin" && (capturedAction as BuiltinAction).feature === "clipboard") {
            invoke("toggle_clipboard_window").catch(console.error);
            return;
          }
          if (capturedAction.type === "builtin" && (capturedAction as BuiltinAction).feature === "json") {
            invoke("toggle_json_helper_window").catch(console.error);
            return;
          }
          if (capturedAction.type === "builtin" && (capturedAction as BuiltinAction).feature === "totp") {
            invoke("toggle_totp_window").catch(console.error);
            return;
          }
          if (capturedAction.type === "builtin" && (capturedAction as BuiltinAction).feature === "remotedesk") {
            invoke("toggle_remotedesk_window").catch(console.error);
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

      // ── Register Alt+Space to toggle main window (always active) ──
      if (!cancelled) {
        try {
          await registerShortcut(
            "Alt+Space",
            makeDebounced(async () => {
              const win = getCurrentWindow();
              if (await win.isVisible()) {
                win.hide().catch(() => {});
              } else {
                win.show().catch(() => {});
                win.setFocus().catch(() => {});
              }
            })
          );
        } catch (err) {
          console.warn("Alt+Space shortcut unavailable:", err);
        }
      }

      // ── Register Ctrl+Shift+V for clipboard window (always active) ──
      if (!cancelled) {
        try {
          await registerShortcut(
            "Ctrl+Shift+V",
            makeDebounced(async () => {
              invoke("toggle_clipboard_window").catch(console.error);
            })
          );
        } catch (err) {
          console.warn("Ctrl+Shift+V shortcut unavailable:", err);
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

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      {/* Glass panel */}
      <div
        className="glass"
        style={{
          width: 840, borderRadius: 16,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          background: hexToRgba(theme.bgColor, theme.bgOpacity),
          backdropFilter: `blur(${theme.blurRadius}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${theme.blurRadius}px) saturate(180%)`,
          border: `1px solid ${theme.borderColor}`,
          position: "relative",
        }}
      >
        {/* ── Title bar (drag region) ─────────────────── */}
        <div
          data-tauri-drag-region
          style={{
            height: 38,
            flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 14px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            cursor: "move",
          }}
        >
          {/* Left: logo + name */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, pointerEvents: "none" }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, color: "#fff",
            }}>D</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)", letterSpacing: "0.3px" }}>
              DevLauncher
            </span>
          </div>

          {/* Right: window controls */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                width: 20, height: 20, borderRadius: 4,
                background: showSettings ? "rgba(59,130,246,0.25)" : "transparent",
                border: showSettings ? "1px solid rgba(59,130,246,0.4)" : "1px solid transparent",
                cursor: "pointer", padding: 0, outline: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: showSettings ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.4)",
                transition: "all 0.12s",
              }}
              title="主题设置"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                <path d="M10 13a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.5 3.5l2 2M14.5 14.5l2 2M14.5 5.5l2-2M3.5 16.5l2-2"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={() => getCurrentWindow().minimize()}
              style={{
                width: 12, height: 12, borderRadius: "50%",
                background: "rgba(255,184,0,0.8)", border: "none", cursor: "pointer", padding: 0,
              }}
              title="最小化"
            />
            <button
              onClick={() => getCurrentWindow().hide()}
              style={{
                width: 12, height: 12, borderRadius: "50%",
                background: "rgba(255,95,87,0.85)", border: "none", cursor: "pointer", padding: 0,
              }}
              title="隐藏到托盘"
            />
          </div>
        </div>

        {/* ── Page tabs ──────────────────────────────── */}
        {config && (
          <div style={{
            display: "flex", alignItems: "flex-end", gap: 3,
            padding: "8px 12px 0", flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
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
                        padding: "4px 8px",
                        minWidth: 48,
                        width: Math.max(48, editingName.length * 9),
                        borderRadius: "6px 6px 0 0",
                        border: "none",
                        borderBottom: "2px solid #3b82f6",
                        background: "rgba(255,255,255,0.15)",
                        color: "rgba(255,255,255,0.95)",
                        fontSize: 12, fontWeight: 500, outline: "none",
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
                        padding: "4px 14px",
                        borderRadius: "6px 6px 0 0",
                        border: "none", cursor: "pointer",
                        fontSize: 12, fontWeight: 500,
                        background: isActive ? "rgba(255,255,255,0.10)" : "transparent",
                        color: isActive ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.38)",
                        borderBottom: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                        transition: "all 0.12s", whiteSpace: "nowrap",
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
                const name = `页面 ${config.pages.length + 1}`;
                addPage(name);
                persistConfig();
              }}
              title="新增页面"
              style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                border: "1px dashed rgba(255,255,255,0.22)",
                background: "transparent",
                color: "rgba(255,255,255,0.45)", fontSize: 16, lineHeight: 1,
                cursor: "pointer", marginBottom: 2, outline: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.12s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.5)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.22)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"; }}
            >+</button>
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
                label: "重命名", icon: "✏️",
                action: () => { setEditingTabIndex(tabMenu.index); setEditingName(config.pages[tabMenu.index].name); setTabMenu(null); }
              },
              ...(config.pages.length > 1 ? [{
                label: "删除此页", icon: "🗑️",
                action: () => { removePage(tabMenu.index); persistConfig(); setTabMenu(null); }, danger: true,
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
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Keyboard area ──────────────────────────── */}
        <div style={{ padding: "14px 16px 16px" }}>
          {!config ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "40px 0", fontSize: 13 }}>
              加载中...
            </div>
          ) : config.pages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>暂无页面配置</div>
              <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 11, marginTop: 6 }}>
                请编辑 keyboard.yaml 添加页面
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

      {/* ── Settings Modal ──────────────────────────── */}
      {showSettings && (
        <div
          style={{
            position: "fixed", inset: 0,
            zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "auto",
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 340, maxHeight: "90vh",
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

      {/* ── Binding Modal ──────────────────────────── */}
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
