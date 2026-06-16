import { useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CSSProperties } from "react";
import { saveConfig } from "@/api/config";
import { MacWindowControls } from "@/components/MacWindowControls";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { DEFAULT_THEME } from "@/types/actions";
import type { KeyId, KeyMap, KeyboardConfig, ThemeConfig, UrlAction } from "@/types/actions";

const PRESET_COLORS = [
  "#101622",
  "#17130f",
  "#10121f",
  "#121a2a",
  "#0f172a",
  "#1c1917",
  "#14532d",
  "#1e3a5f",
];

const THEME_PRESETS: { name: string; theme: ThemeConfig }[] = [
  { name: "经典黑", theme: { ...DEFAULT_THEME } },
  {
    name: "暖棕",
    theme: {
      bgColor: "#17130f",
      bgOpacity: 0.93,
      blurRadius: 22,
      borderColor: "#80695b85",
      keyBgOpacity: 0.052,
    },
  },
  {
    name: "蓝紫",
    theme: {
      bgColor: "#101622",
      bgOpacity: 0.93,
      blurRadius: 24,
      borderColor: "#848eb28a",
      keyBgOpacity: 0.064,
    },
  },
];

type SettingsSection = "appearance" | "webaccounts" | "entries";

interface WebAccountEntry {
  id: string;
  pageIndex: number;
  keyId: KeyId;
  pageName: string;
  action: UrlAction;
  origin: string;
}

interface EditState {
  name: string;
  target: string;
  username: string;
  password: string;
  autofill: boolean;
  autoSubmit: boolean;
  usernameSelector: string;
  passwordSelector: string;
}

const LABEL: CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  fontWeight: 500,
  marginBottom: 4,
};

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
};

const INPUT: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.86)",
  outline: "none",
  fontSize: 12,
};

const BUTTON: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.72)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

const panelStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.045)",
};

function getUrlOrigin(value: string): string | null {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function getWebAccountEntries(config: KeyboardConfig | null): WebAccountEntry[] {
  if (!config) return [];
  const entries: WebAccountEntry[] = [];

  config.pages.forEach((page, pageIndex) => {
    (Object.entries(page.keys) as [KeyId, KeyMap[KeyId]][]).forEach(([keyId, binding]) => {
      const action = binding?.action;
      if (action?.type !== "url") return;
      if (!action.username && !action.hasPassword && !action.autofill) return;
      entries.push({
        id: `${pageIndex}:${keyId}`,
        pageIndex,
        keyId,
        pageName: page.name,
        action,
        origin: getUrlOrigin(action.target) ?? "",
      });
    });
  });

  return entries;
}

function editStateFromAction(action: UrlAction): EditState {
  return {
    name: action.name,
    target: action.target,
    username: action.username ?? "",
    password: "",
    autofill: action.autofill ?? false,
    autoSubmit: action.autoSubmit ?? false,
    usernameSelector: action.usernameSelector ?? "",
    passwordSelector: action.passwordSelector ?? "",
  };
}

async function persistConfig(next: KeyboardConfig) {
  useKeyboardStore.setState((state) => ({
    config: next,
    theme: next.theme ?? state.theme,
  }));
  await saveConfig(next);
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const config = useKeyboardStore((s) => s.config);
  const theme = useKeyboardStore((s) => s.theme);
  const setTheme = useKeyboardStore((s) => s.setTheme);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const webAccounts = useMemo(() => getWebAccountEntries(config), [config]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingEntry = webAccounts.find((entry) => entry.id === editingId) ?? webAccounts[0] ?? null;
  const [editState, setEditState] = useState<EditState | null>(null);
  const [status, setStatus] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(contentRef, () => {
    const children = contentRef.current?.children;
    if (!children?.length) return;
    animateListEnter(Array.from(children), reducedMotion);
  }, [activeSection, webAccounts.length, editingId, reducedMotion]);

  const persistTheme = (partial: Partial<ThemeConfig>) => {
    setTheme(partial);
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  };

  const applyPreset = (preset: ThemeConfig) => {
    setTheme({ ...preset });
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  };

  const beginEdit = (entry: WebAccountEntry) => {
    setEditingId(entry.id);
    setEditState(editStateFromAction(entry.action));
    setStatus("");
  };

  const updateEntry = async (entry: WebAccountEntry, nextState: EditState) => {
    if (!config) return;
    const origin = getUrlOrigin(nextState.target);
    if (!origin) {
      setStatus("请输入有效网址。");
      return;
    }

    const username = nextState.username.trim();
    const oldOrigin = getUrlOrigin(entry.action.target);
    const keyChanged = oldOrigin !== origin || (entry.action.username ?? "") !== username;
    const willHavePassword = Boolean(entry.action.hasPassword || nextState.password);

    if (willHavePassword && !username) {
      setStatus("保存密码需要账号名。");
      return;
    }

    if (keyChanged && entry.action.hasPassword && !nextState.password) {
      setStatus("修改网址或账号时，请重新输入密码。");
      return;
    }

    if (nextState.password) {
      try {
        await invoke("save_web_password", {
          origin,
          username,
          password: nextState.password,
        });
        if (keyChanged && oldOrigin && entry.action.username) {
          await invoke("delete_web_password", {
            origin: oldOrigin,
            username: entry.action.username,
          }).catch(() => {});
        }
      } catch (error) {
        setStatus(String(error));
        return;
      }
    }

    const nextAction: UrlAction = {
      type: "url",
      name: nextState.name.trim() || nextState.target.trim(),
      target: nextState.target.trim(),
      ...(username ? { username } : {}),
      ...(willHavePassword ? { hasPassword: true } : {}),
      ...(nextState.autofill ? { autofill: true } : {}),
      ...(nextState.autoSubmit ? { autoSubmit: true } : {}),
      ...(nextState.usernameSelector.trim() ? { usernameSelector: nextState.usernameSelector.trim() } : {}),
      ...(nextState.passwordSelector.trim() ? { passwordSelector: nextState.passwordSelector.trim() } : {}),
    };

    const pages = [...config.pages];
    const page = { ...pages[entry.pageIndex], keys: { ...pages[entry.pageIndex].keys } };
    page.keys[entry.keyId] = { action: nextAction };
    pages[entry.pageIndex] = page;
    await persistConfig({ ...config, pages });
    setEditState({ ...nextState, password: "" });
    setStatus("已保存。");
  };

  const clearPassword = async (entry: WebAccountEntry) => {
    if (!config || !entry.origin || !entry.action.username) return;
    if (!window.confirm(`清除“${entry.action.name}”保存的网页密码？`)) return;

    await invoke("delete_web_password", {
      origin: entry.origin,
      username: entry.action.username,
    }).catch((error) => setStatus(String(error)));

    const nextAction: UrlAction = { ...entry.action };
    delete nextAction.hasPassword;
    const pages = [...config.pages];
    const page = { ...pages[entry.pageIndex], keys: { ...pages[entry.pageIndex].keys } };
    page.keys[entry.keyId] = { action: nextAction };
    pages[entry.pageIndex] = page;
    await persistConfig({ ...config, pages });
    setStatus("密码已清除。");
  };

  const removeBinding = async (entry: WebAccountEntry) => {
    if (!config) return;
    if (!window.confirm(`移除网页账号绑定“${entry.action.name}”？`)) return;

    if (entry.action.hasPassword && entry.origin && entry.action.username) {
      await invoke("delete_web_password", {
        origin: entry.origin,
        username: entry.action.username,
      }).catch(() => {});
    }

    const pages = [...config.pages];
    const page = { ...pages[entry.pageIndex], keys: { ...pages[entry.pageIndex].keys } };
    page.keys[entry.keyId] = { action: null };
    pages[entry.pageIndex] = page;
    await persistConfig({ ...config, pages });
    setEditingId(null);
    setEditState(null);
    setStatus("绑定已移除。");
  };

  if (editingEntry && !editState) {
    setTimeout(() => beginEdit(editingEntry), 0);
  }

  return (
    <div
      ref={rootRef}
      className="settings-panel motion-panel"
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "132px 1fr",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .settings-panel input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          padding: 0 !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          height: 14px;
          min-height: 14px;
        }
        .settings-panel input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          margin-top: -5px;
          border: 2px solid rgba(255,255,255,0.9);
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        .settings-panel input[type="range"]::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
          background: rgba(255,255,255,0.12);
        }
        .settings-panel input[type="color"] {
          padding: 0 !important;
          border: none !important;
          background: none !important;
          box-shadow: none !important;
          outline: none !important;
          -webkit-appearance: none;
          appearance: none;
          cursor: pointer;
        }
        .settings-panel input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        .settings-panel input[type="color"]::-webkit-color-swatch { border: none; border-radius: 4px; }
        .settings-panel button { font-family: inherit; }
      `}</style>

      <aside
        style={{
          padding: 12,
          borderRight: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(0,0,0,0.10)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.86)", marginBottom: 12 }}>
          设置
        </div>
        {[
          ["appearance", "外观"],
          ["webaccounts", "网页账号"],
          ["entries", "入口"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveSection(id as SettingsSection)}
            style={{
              width: "100%",
              padding: "8px 10px",
              marginBottom: 6,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              background: activeSection === id ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.04)",
              color: activeSection === id ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.58)",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {label}
          </button>
        ))}
      </aside>

      <main style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            height: 44,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.84)" }}>
            {activeSection === "appearance" ? "外观设置" : activeSection === "entries" ? "入口设置" : "URL 与账号密码本"}
          </div>
          <MacWindowControls onClose={onClose} closeTitle="关闭设置" />
        </header>

        <div ref={contentRef} className="motion-scroll-area" style={{ padding: 14, minHeight: 0 }}>
          {activeSection === "appearance" ? (
            <>
              <div style={LABEL}>预设主题</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {THEME_PRESETS.map((preset) => (
                  <button key={preset.name} onClick={() => applyPreset(preset.theme)} style={BUTTON}>
                    {preset.name}
                  </button>
                ))}
              </div>

              <div style={LABEL}>背景色</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => persistTheme({ bgColor: color })}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: color,
                      border: theme.bgColor === color ? "2px solid #60a5fa" : "1px solid rgba(255,255,255,0.16)",
                      cursor: "pointer",
                    }}
                    aria-label={`背景色 ${color}`}
                  />
                ))}
                <label
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: "1px dashed rgba(255,255,255,0.26)",
                    cursor: "pointer",
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>+</span>
                  <input
                    type="color"
                    value={theme.bgColor}
                    onChange={(event) => persistTheme({ bgColor: event.target.value })}
                    style={{ position: "absolute", opacity: 0, width: "100%", height: "100%" }}
                  />
                </label>
              </div>

              <div style={LABEL}>背景透明度</div>
              <div style={ROW}>
                <input type="range" min={0.1} max={1} step={0.02} value={theme.bgOpacity} onChange={(event) => persistTheme({ bgOpacity: parseFloat(event.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", width: 34, textAlign: "right", fontFamily: "monospace" }}>{Math.round(theme.bgOpacity * 100)}%</span>
              </div>

              <div style={LABEL}>模糊强度</div>
              <div style={ROW}>
                <input type="range" min={0} max={60} step={2} value={theme.blurRadius} onChange={(event) => persistTheme({ blurRadius: parseFloat(event.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", width: 34, textAlign: "right", fontFamily: "monospace" }}>{theme.blurRadius}px</span>
              </div>

              <div style={LABEL}>边框色</div>
              <div style={{ ...ROW, marginBottom: 14 }}>
                <input type="color" value={theme.borderColor.slice(0, 7)} onChange={(event) => persistTheme({ borderColor: event.target.value + "1a" })} style={{ width: 24, height: 24, borderRadius: 6 }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontFamily: "monospace" }}>{theme.borderColor.slice(0, 7)}</span>
              </div>

              <div style={LABEL}>空键背景透明度</div>
              <div style={ROW}>
                <input type="range" min={0} max={0.3} step={0.01} value={theme.keyBgOpacity} onChange={(event) => persistTheme({ keyBgOpacity: parseFloat(event.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", width: 34, textAlign: "right", fontFamily: "monospace" }}>{Math.round(theme.keyBgOpacity * 100)}%</span>
              </div>
            </>
          ) : activeSection === "entries" ? (
            <section className="motion-list" style={{ padding: 2 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>入口</h2>
              <div style={{ ...panelStyle, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Search</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
                  快捷键：Ctrl+Alt+K。搜索键盘绑定、内置功能和最近动作。
                </div>
              </div>
              <div style={{ ...panelStyle, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Desktop pet</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
                  快捷键：Ctrl+Alt+P。打开搜索、截图报告、剪切板、键盘模式和隐藏操作；可拖动并保存位置。
                </div>
              </div>
            </section>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 0.9fr) minmax(280px, 1.1fr)", gap: 12, minHeight: 0 }}>
              <section style={{ border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, overflow: "hidden", minHeight: 0 }}>
                <div style={{ padding: "9px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 800 }}>
                  已绑定账号
                </div>
                <div className="motion-list motion-scroll-area" style={{ maxHeight: 420 }}>
                  {webAccounts.length === 0 ? (
                    <div style={{ padding: 12, color: "rgba(255,255,255,0.42)", fontSize: 12, lineHeight: 1.6 }}>
                      暂无 URL 账号绑定。请在按键绑定的“网址”中启用 Chrome 登录页自动填入。
                    </div>
                  ) : webAccounts.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => beginEdit(entry)}
                      style={{
                        width: "100%",
                        padding: 10,
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        background: editingEntry?.id === entry.id ? "rgba(59,130,246,0.18)" : "transparent",
                        color: "rgba(255,255,255,0.76)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.action.name}</div>
                      <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.42)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {entry.pageName} / {entry.keyId} / {entry.action.username || "未设置账号"}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="motion-scroll-area" style={{ border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: 12, minHeight: 0 }}>
                {!editingEntry || !editState ? (
                  <div style={{ color: "rgba(255,255,255,0.42)", fontSize: 12 }}>选择左侧账号进行管理。</div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.86)", fontWeight: 800 }}>{editingEntry.pageName} / {editingEntry.keyId}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", marginTop: 4 }}>{editingEntry.origin || "无有效 origin"}</div>
                      </div>
                      <button onClick={() => removeBinding(editingEntry)} style={{ ...BUTTON, borderColor: "rgba(239,68,68,0.28)", color: "rgba(248,113,113,0.9)" }}>移除</button>
                    </div>

                    <div style={LABEL}>名称</div>
                    <input style={{ ...INPUT, marginBottom: 10 }} value={editState.name} onChange={(event) => setEditState({ ...editState, name: event.target.value })} />
                    <div style={LABEL}>网址</div>
                    <input style={{ ...INPUT, marginBottom: 10 }} value={editState.target} onChange={(event) => setEditState({ ...editState, target: event.target.value })} />
                    <div style={LABEL}>账号</div>
                    <input style={{ ...INPUT, marginBottom: 10 }} value={editState.username} onChange={(event) => setEditState({ ...editState, username: event.target.value })} />
                    <div style={LABEL}>重设密码</div>
                    <input
                      style={{ ...INPUT, marginBottom: 10 }}
                      type="password"
                      value={editState.password}
                      placeholder={editingEntry.action.hasPassword ? "已保存，留空不修改" : "输入后保存到系统凭据"}
                      onChange={(event) => setEditState({ ...editState, password: event.target.value })}
                    />

                    <label style={{ display: "flex", gap: 8, alignItems: "center", color: "rgba(255,255,255,0.68)", fontSize: 12, marginBottom: 8 }}>
                      <input type="checkbox" checked={editState.autofill} onChange={(event) => setEditState({ ...editState, autofill: event.target.checked })} />
                      启用 Chrome 自动填入
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", color: "rgba(255,255,255,0.68)", fontSize: 12, marginBottom: 10 }}>
                      <input type="checkbox" checked={editState.autoSubmit} onChange={(event) => setEditState({ ...editState, autoSubmit: event.target.checked })} />
                      填入后自动提交
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <div style={LABEL}>账号选择器</div>
                        <input style={INPUT} value={editState.usernameSelector} onChange={(event) => setEditState({ ...editState, usernameSelector: event.target.value })} placeholder="可选" />
                      </div>
                      <div>
                        <div style={LABEL}>密码选择器</div>
                        <input style={INPUT} value={editState.passwordSelector} onChange={(event) => setEditState({ ...editState, passwordSelector: event.target.value })} placeholder="可选" />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                      {editingEntry.action.hasPassword && <button onClick={() => clearPassword(editingEntry)} style={BUTTON}>清除密码</button>}
                      <button onClick={() => updateEntry(editingEntry, editState)} style={{ ...BUTTON, background: "rgba(37,99,235,0.70)", color: "#fff", borderColor: "rgba(96,165,250,0.32)" }}>保存</button>
                    </div>
                    {status && (
                      <div style={{ marginTop: 10, color: status.includes("已") ? "rgba(74,222,128,0.86)" : "rgba(248,113,113,0.9)", fontSize: 11 }}>
                        {status}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
