import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import type {
  Action, ActionType, KeyId,
  AppAction, FolderAction, FileAction, UrlAction, SshAction, ScriptAction, SystemAction, BuiltinAction, BuiltinFeature, SshTerminal, FolderOpenWith
} from "@/types/actions";
import { ACTION_TYPE_META, SYSTEM_PRESETS, BUILTIN_FEATURES } from "@/types/actions";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { animateDialogEnter, animateListEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";

interface BindingModalProps {
  keyId: KeyId;
  initialAction?: Action | null;
  onClose: () => void;
  onSave: (action: Action) => void;
  onClear?: () => void;
}

const TABS: ActionType[] = ["app", "folder", "url", "ssh", "script", "system", "builtin"];

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: "7px 10px",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 7, color: "#e8eaf0",
  fontSize: 13, outline: "none",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11, color: "rgba(255,255,255,0.45)",
  marginBottom: 4, display: "block",
};

const BROWSE_BTN_STYLE: React.CSSProperties = {
  padding: "7px 12px",
  background: "rgba(255,255,255,0.09)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 7, color: "rgba(255,255,255,0.75)",
  fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
  outline: "none", flexShrink: 0,
  transition: "background 0.12s",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

function getUrlOrigin(value: string): string | null {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

export function BindingModal({ keyId, initialAction, onClose, onSave, onClear }: BindingModalProps) {
  const [activeType, setActiveType] = useState<ActionType>(initialAction?.type ?? "app");
  const [saveError, setSaveError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  // Form state for each type
  const [name, setName]       = useState(initialAction?.name ?? "");
  const [target, setTarget]   = useState((initialAction as AppAction | FolderAction | FileAction | UrlAction)?.target ?? "");
  const initialUrlAction = initialAction?.type === "url" ? initialAction as UrlAction : null;
  const [webUsername, setWebUsername] = useState(initialUrlAction?.username ?? "");
  const [webPassword, setWebPassword] = useState("");
  const [webHasPassword, setWebHasPassword] = useState(initialUrlAction?.hasPassword ?? false);
  const [webAutofill, setWebAutofill] = useState(initialUrlAction?.autofill ?? false);
  const [webAutoSubmit, setWebAutoSubmit] = useState(initialUrlAction?.autoSubmit ?? false);
  const [webUsernameSelector, setWebUsernameSelector] = useState(initialUrlAction?.usernameSelector ?? "");
  const [webPasswordSelector, setWebPasswordSelector] = useState(initialUrlAction?.passwordSelector ?? "");
  const [folderOpenWith, setFolderOpenWith] = useState<FolderOpenWith>(
    (initialAction as FolderAction)?.openWith ?? "explorer"
  );
  const [customOpener, setCustomOpener] = useState((initialAction as FolderAction)?.customOpener ?? "");
  const [customOpenerArgs, setCustomOpenerArgs] = useState((initialAction as FolderAction)?.customOpenerArgs ?? "{path}");
  const [host, setHost]       = useState((initialAction as SshAction)?.host ?? "");
  const [user, setUser]       = useState((initialAction as SshAction)?.user ?? "");
  const [port, setPort]       = useState(String((initialAction as SshAction)?.port ?? 22));
  const [sshPassword, setSshPassword]           = useState("");
  const [sshHasPassword, setSshHasPassword]     = useState((initialAction as SshAction)?.hasPassword ?? false);
  const [sshTerminal, setSshTerminal]           = useState<SshTerminal>((initialAction as SshAction)?.terminal ?? "auto");
  const [shell, setShell]     = useState<"powershell"|"cmd"|"bat"|"wsl"|"terminal">((initialAction as ScriptAction)?.shell ?? "powershell");
  const [content, setContent] = useState((initialAction as ScriptAction)?.content ?? "");
  const [sysCmd, setSysCmd]   = useState((initialAction as SystemAction)?.command ?? "calculator");
  const [builtinFeature, setBuiltinFeature] = useState<BuiltinFeature>(
    (initialAction as BuiltinAction)?.feature ?? "clipboard"
  );

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animateDialogEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(listRef, () => {
    const children = listRef.current?.children;
    if (!children?.length) return;
    animateListEnter(Array.from(children), reducedMotion);
  }, [activeType, folderOpenWith, webAutofill, webHasPassword, sshHasPassword, reducedMotion]);

  const handleBrowseApp = async () => {
    const result = await dialogOpen({
      multiple: false,
      directory: false,
      filters: [{ name: "程序", extensions: ["exe", "cmd", "bat", "lnk"] }],
    });
    if (typeof result === "string") {
      setTarget(result);
      if (!name) setName(result.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "");
    }
  };

  const handleBrowseFolder = async () => {
    const result = await dialogOpen({ multiple: false, directory: true });
    if (typeof result === "string") {
      setTarget(result);
      if (!name) setName(result.split(/[\\/]/).pop() ?? "文件夹");
    }
  };

  const handleBrowseFile = async () => {
    const result = await dialogOpen({ multiple: false, directory: false });
    if (typeof result === "string") {
      setTarget(result);
      if (!name) setName(result.split(/[\\/]/).pop() ?? "文件");
    }
  };

  const handleBrowseCustomOpener = async () => {
    const result = await dialogOpen({
      multiple: false,
      directory: false,
      filters: [{ name: "Program", extensions: ["exe", "cmd", "bat", "lnk"] }],
    });
    if (typeof result === "string") {
      setCustomOpener(result);
    }
  };

  const handleSave = async () => {
    setSaveError("");
    let action: Action | null = null;
    switch (activeType) {
      case "app":
        if (!target.trim()) return;
        action = { type: "app", name: name || target.split(/[\\/]/).pop() || "App", target: target.trim() };
        break;
      case "folder":
        if (!target.trim()) return;
        if (folderOpenWith === "custom" && !customOpener.trim()) return;
        action = {
          type: "folder",
          name: name || "文件夹",
          target: target.trim(),
          openWith: folderOpenWith,
          ...(folderOpenWith === "custom" ? {
            customOpener: customOpener.trim(),
            customOpenerArgs: customOpenerArgs.trim() || "{path}",
          } : {}),
        };
        break;
      case "file":
        if (!target.trim()) return;
        action = { type: "file", name: name || "文件", target: target.trim() };
        break;
      case "url":
        if (!target.trim()) return;
        {
          const willHavePassword = webHasPassword || webPassword.length > 0;
          const username = webUsername.trim();
          if (webAutofill && willHavePassword && !username) {
            setSaveError("网页账号需要填写账号名。");
            return;
          }
          action = {
            type: "url",
            name: name || target,
            target: target.trim(),
            ...(username ? { username } : {}),
            ...(willHavePassword ? { hasPassword: true } : {}),
            ...(webAutofill ? { autofill: true } : {}),
            ...(webAutoSubmit ? { autoSubmit: true } : {}),
            ...(webUsernameSelector.trim() ? { usernameSelector: webUsernameSelector.trim() } : {}),
            ...(webPasswordSelector.trim() ? { passwordSelector: webPasswordSelector.trim() } : {}),
          };
        }
        break;
      case "ssh":
        if (!host.trim() || !user.trim()) return;
        {
          const willHavePassword = sshHasPassword || sshPassword.length > 0;
          action = { type: "ssh", name: name || `${user}@${host}`, host: host.trim(), user: user.trim(), port: Number(port) || 22, terminal: sshTerminal, ...(willHavePassword ? { hasPassword: true } : {}) };
        }
        break;
      case "script":
        action = { type: "script", name: name || "脚本", shell, content: content.trim() };
        break;
      case "system": {
        const preset = SYSTEM_PRESETS.find(p => p.command === sysCmd)!;
        action = { type: "system", name: name || preset.name, command: sysCmd } as SystemAction;
        break;
      }
      case "builtin": {
        const feat = BUILTIN_FEATURES[builtinFeature];
        action = { type: "builtin", name: feat.name, feature: builtinFeature } as BuiltinAction;
        break;
      }
    }
    if (action) {
      // Persist SSH password to OS credential store (never saved in YAML config)
      if (activeType === "ssh" && sshPassword.length > 0) {
        const credKey = `ssh:${(action as SshAction).user}@${(action as SshAction).host}:${(action as SshAction).port ?? 22}`;
        await invoke("save_ssh_password", { key: credKey, password: sshPassword }).catch(console.error);
      }
      if (activeType === "url" && webPassword.length > 0) {
        const a = action as UrlAction;
        const origin = getUrlOrigin(a.target);
        if (!origin || !a.username) {
          setSaveError("请输入有效的网址和账号。");
          return;
        }
        try {
          await invoke("save_web_password", { origin, username: a.username, password: webPassword });
        } catch (error) {
          console.error(error);
          setSaveError(String(error));
          return;
        }
      }
      onSave(action);
    }
  };

  return (
    // Overlay
    <div
      style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}

    >
      {/* Panel */}
      <div
        ref={rootRef}
        className="motion-dialog"
        style={{
          width: 460,
          maxHeight: "90vh",
          minHeight: 0,
          display: "flex", flexDirection: "column",
          background: "var(--theme-bg, rgba(22, 24, 40, 0.97))",
          backdropFilter: "blur(var(--theme-blur, 32px)) saturate(180%)",
          WebkitBackdropFilter: "blur(var(--theme-blur, 32px)) saturate(180%)",
          border: "1px solid var(--theme-border, rgba(255,255,255,0.12))",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e8eaf0" }}>
            绑定按键 <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>[{keyId}]</span>
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1 }}
          >×</button>
        </div>

        {/* Type Tabs */}
        <div style={{
          display: "flex", gap: 4, padding: "10px 14px 0",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          {TABS.map((t) => {
            const meta = ACTION_TYPE_META[t];
            const active = t === activeType;
            return (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                style={{
                  padding: "5px 10px", borderRadius: "7px 7px 0 0",
                  fontSize: 12, fontWeight: 500, cursor: "pointer",
                  border: "none", outline: "none",
                  background: active ? "rgba(255,255,255,0.10)" : "transparent",
                  color: active ? meta.color : "rgba(255,255,255,0.38)",
                  borderBottom: active ? `2px solid ${meta.color}` : "2px solid transparent",
                  transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Form body */}
        <div ref={listRef} className="motion-scroll-area" style={{ padding: "16px 16px 12px", flex: 1 }}>
          {/* Name field (common) */}
          {activeType !== "system" && (
            <Field label="名称（可选，自动填充）">
              <input
                style={INPUT_STYLE}
                placeholder="显示名称"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </Field>
          )}

          {/* App */}
          {(activeType === "app") && (
            <Field label="程序路径 *">
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ ...INPUT_STYLE, flex: 1 }}
                  placeholder="C:\Program Files\...\app.exe"
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                />
                <button style={BROWSE_BTN_STYLE} onClick={handleBrowseApp}>浏览</button>
              </div>
            </Field>
          )}

          {/* Folder / File */}
          {(activeType === "folder" || activeType === "file") && (
            <Field label={activeType === "folder" ? "目录路径 *" : "文件路径 *"}>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ ...INPUT_STYLE, flex: 1 }}
                  placeholder={activeType === "folder" ? "D:\\Project" : "D:\\document.pdf"}
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                />
                <button
                  style={BROWSE_BTN_STYLE}
                  onClick={activeType === "folder" ? handleBrowseFolder : handleBrowseFile}
                >浏览</button>
              </div>
            </Field>
          )}

          {activeType === "folder" && (
            <>
              <Field label="打开方式">
                <select
                  value={folderOpenWith}
                  onChange={e => setFolderOpenWith(e.target.value as FolderOpenWith)}
                  style={{ ...INPUT_STYLE, cursor: "pointer" }}
                >
                  <option value="explorer" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>文件资源管理器</option>
                  <option value="vscode" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>VS Code</option>
                  <option value="cursor" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Cursor</option>
                  <option value="custom" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>其他工具</option>
                </select>
              </Field>
              {folderOpenWith === "custom" && (
                <>
                  <Field label="工具路径 *">
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        style={{ ...INPUT_STYLE, flex: 1 }}
                        placeholder="C:\Program Files\...\app.exe"
                        value={customOpener}
                        onChange={e => setCustomOpener(e.target.value)}
                      />
                      <button style={BROWSE_BTN_STYLE} onClick={handleBrowseCustomOpener}>浏览</button>
                    </div>
                  </Field>
                  <Field label="启动参数">
                    <input
                      style={INPUT_STYLE}
                      placeholder="{path}"
                      value={customOpenerArgs}
                      onChange={e => setCustomOpenerArgs(e.target.value)}
                    />
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3, display: "block" }}>
                      使用 {"{path}"} 作为目录占位符；留空时默认只传目录路径。
                    </span>
                  </Field>
                </>
              )}
            </>
          )}

          {/* URL */}
          {activeType === "url" && (
            <>
              <Field label="网址 *">
                <input
                  style={INPUT_STYLE}
                  placeholder="https://example.com"
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                />
              </Field>
              <div style={{
                marginBottom: 12,
                padding: 10,
                borderRadius: 9,
                border: "1px solid rgba(52,211,153,0.18)",
                background: "rgba(5,120,80,0.10)",
              }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={webAutofill}
                    onChange={e => setWebAutofill(e.target.checked)}
                  />
                  Chrome 登录页自动填入
                </label>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 5, display: "block", lineHeight: 1.5 }}>
                  密码存入系统凭据库；外置 Chrome 需要安装 DevLauncher 扩展和 Native Messaging Host。
                </span>
              </div>
              {webAutofill && (
                <>
                  <Field label="账号">
                    <input
                      style={INPUT_STYLE}
                      placeholder="name@example.com"
                      value={webUsername}
                      onChange={e => setWebUsername(e.target.value)}
                      autoComplete="username"
                    />
                  </Field>
                  <Field label="密码（可选）">
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        style={INPUT_STYLE}
                        type="password"
                        placeholder={webHasPassword ? "已保存，留空保持不变" : "输入密码存入系统凭据"}
                        value={webPassword}
                        onChange={e => setWebPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                      {webHasPassword && (
                        <button
                          type="button"
                          title="清除已保存的网页密码"
                          onClick={async () => {
                            if (!window.confirm("清除已保存的网页密码？")) return;
                            const origin = getUrlOrigin(target);
                            if (origin && webUsername.trim()) {
                              await invoke("delete_web_password", { origin, username: webUsername.trim() }).catch(console.error);
                            }
                            setWebHasPassword(false);
                            setWebPassword("");
                          }}
                          style={{
                            flexShrink: 0, padding: "7px 10px", cursor: "pointer",
                            background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                            borderRadius: 7, color: "rgba(239,68,68,0.8)", fontSize: 11, whiteSpace: "nowrap",
                          }}
                        >
                          清除密码
                        </button>
                      )}
                    </div>
                  </Field>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Field label="账号选择器（可选）">
                      <input
                        style={INPUT_STYLE}
                        placeholder="input[name=email]"
                        value={webUsernameSelector}
                        onChange={e => setWebUsernameSelector(e.target.value)}
                      />
                    </Field>
                    <Field label="密码选择器（可选）">
                      <input
                        style={INPUT_STYLE}
                        placeholder="input[type=password]"
                        value={webPasswordSelector}
                        onChange={e => setWebPasswordSelector(e.target.value)}
                      />
                    </Field>
                  </div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", color: "rgba(255,255,255,0.68)", fontSize: 12, marginBottom: 12 }}>
                    <input
                      type="checkbox"
                      checked={webAutoSubmit}
                      onChange={e => setWebAutoSubmit(e.target.checked)}
                    />
                    填入后自动提交（默认关闭）
                  </label>
                </>
              )}
            </>
          )}

          {/* SSH */}
          {activeType === "ssh" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Field label="主机地址 *">
                    <input style={INPUT_STYLE} placeholder="192.168.1.100" value={host} onChange={e => setHost(e.target.value)} />
                  </Field>
                </div>
                <div style={{ width: 72 }}>
                  <Field label="端口">
                    <input style={INPUT_STYLE} placeholder="22" value={port} onChange={e => setPort(e.target.value)} />
                  </Field>
                </div>
              </div>
              <Field label="用户名 *">
                <input style={INPUT_STYLE} placeholder="root" value={user} onChange={e => setUser(e.target.value)} />
              </Field>
              <Field label="密码（可选）">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    style={INPUT_STYLE}
                    type="password"
                    placeholder={sshHasPassword ? "••••••••（已保存，留空保持不变）" : "输入密码存入系统凭据"}
                    value={sshPassword}
                    onChange={e => setSshPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  {sshHasPassword && (
                    <button
                      type="button"
                      title="清除已保存的密码"
                      onClick={async () => {
                        if (!window.confirm("清除已保存的 SSH 密码？")) return;
                        const credKey = `ssh:${user.trim()}@${host.trim()}:${Number(port) || 22}`;
                        await invoke("delete_ssh_password", { key: credKey }).catch(console.error);
                        setSshHasPassword(false);
                        setSshPassword("");
                      }}
                      style={{
                        flexShrink: 0, padding: "7px 10px", cursor: "pointer",
                        background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: 7, color: "rgba(239,68,68,0.8)", fontSize: 11, whiteSpace: "nowrap",
                      }}
                    >
                      清除密码
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3, display: "block" }}>
                  密码存储于系统凭据管理器，不写入配置文件
                </span>
              </Field>
              <Field label="终端">
                <select
                  value={sshTerminal}
                  onChange={e => setSshTerminal(e.target.value as SshTerminal)}
                  style={{ ...INPUT_STYLE, cursor: "pointer" }}
                >
                  <option value="auto" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>自动（优先 Windows Terminal）</option>
                  <option value="wt" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Windows Terminal (wt.exe)</option>
                  <option value="cmd" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>CMD</option>
                  <option value="powershell" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>PowerShell</option>
                  <option value="gitbash" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Git Bash（支持 expect 自动密码）</option>
                  <option value="terminal" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>内置终端</option>
                </select>
                {sshTerminal === "gitbash" && (
                  <span style={{ fontSize: 10, color: "rgba(255,195,0,0.7)", marginTop: 3, display: "block" }}>
                    需安装 Git for Windows，路径 C:\Program Files\Git\bin\bash.exe
                  </span>
                )}
              </Field>
            </>
          )}

          {/* Script */}
          {activeType === "script" && (
            <>
              <Field label="Shell">
                <select
                  value={shell}
                  onChange={e => setShell(e.target.value as typeof shell)}
                  style={{ ...INPUT_STYLE, cursor: "pointer" }}
                >
                  <option value="powershell" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>PowerShell</option>
                  <option value="cmd" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>CMD</option>
                  <option value="bat" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Bat 文件</option>
                  <option value="wsl" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>WSL (Ubuntu)</option>
                  <option value="terminal" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>内置终端</option>
                </select>
              </Field>
              <Field label="脚本内容 *">
                <textarea
                  style={{ ...INPUT_STYLE, minHeight: 72, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
                  placeholder={
                    shell === "powershell" ? "Get-Process | Out-GridView" :
                    shell === "wsl" ? "内联命令: ls -la && echo hello\n.sh 脚本: /home/user/test.sh" :
                    "echo hello"
                  }
                  value={content}
                  onChange={e => setContent(e.target.value)}
                />
              </Field>
            </>
          )}

          {/* System */}
          {activeType === "system" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {SYSTEM_PRESETS.map(p => (
                <button
                  key={p.command}
                  onClick={() => setSysCmd(p.command)}
                  style={{
                    padding: "10px 6px", borderRadius: 9, cursor: "pointer",
                    border: `1px solid ${sysCmd === p.command ? "rgba(148,163,184,0.5)" : "rgba(255,255,255,0.08)"}`,
                    background: sysCmd === p.command ? "rgba(148,163,184,0.15)" : "rgba(255,255,255,0.04)",
                    color: "#e8eaf0", fontSize: 11, fontWeight: 500,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease", outline: "none",
                  }}
                >
                  <span style={{ fontSize: 20 }}>{p.emoji}</span>
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Builtin */}
          {activeType === "builtin" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {(Object.entries(BUILTIN_FEATURES) as [BuiltinFeature, typeof BUILTIN_FEATURES[BuiltinFeature]][]).map(([feat, meta]) => (
                <button
                  key={feat}
                  onClick={() => setBuiltinFeature(feat)}
                  style={{
                    padding: "16px 10px", borderRadius: 10, cursor: "pointer",
                    border: `1px solid ${builtinFeature === feat ? "rgba(56,189,248,0.55)" : "rgba(255,255,255,0.08)"}`,
                    background: builtinFeature === feat ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.04)",
                    color: "#e8eaf0", fontSize: 12, fontWeight: 500,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
                    transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease", outline: "none",
                  }}
                >
                  <BuiltinIcon feature={feat} size={30} />
                  <span style={{ fontWeight: 600 }}>{meta.name}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.4 }}>{meta.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 16px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div>
            {onClear && initialAction && (
              <button
                onClick={async () => {
                  if (!window.confirm(`清除 ${keyId} 的绑定？已保存的相关密码也会删除。`)) return;
                  // Also delete stored SSH password when clearing binding
                  if (initialAction.type === "ssh" && (initialAction as SshAction).hasPassword) {
                    const a = initialAction as SshAction;
                    await invoke("delete_ssh_password", {
                      key: `ssh:${a.user}@${a.host}:${a.port ?? 22}`,
                    }).catch(console.error);
                  }
                  if (initialAction.type === "url" && (initialAction as UrlAction).hasPassword) {
                    const a = initialAction as UrlAction;
                    const origin = getUrlOrigin(a.target);
                    if (origin && a.username) {
                      await invoke("delete_web_password", {
                        origin,
                        username: a.username,
                      }).catch(console.error);
                    }
                  }
                  onClear();
                }}
                style={{
                  padding: "6px 12px", borderRadius: 7, cursor: "pointer",
                  border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.10)",
                  color: "rgba(239,68,68,0.8)", fontSize: 12, fontWeight: 500,
                }}
              >
                清除绑定
              </button>
            )}
            {saveError && (
              <span style={{ marginLeft: 10, color: "rgba(248,113,113,0.88)", fontSize: 11 }}>
                {saveError}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "6px 16px", borderRadius: 7, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500,
              }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "6px 20px", borderRadius: 7, cursor: "pointer",
                border: "none", background: "rgba(37,99,235,0.80)",
                color: "#fff", fontSize: 12, fontWeight: 600,
              }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
