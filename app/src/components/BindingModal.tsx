import { useState } from "react";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import type {
  Action, ActionType, KeyId,
  AppAction, FolderAction, FileAction, UrlAction, SshAction, ScriptAction, SystemAction, BuiltinAction, BuiltinFeature
} from "@/types/actions";
import { ACTION_TYPE_META, SYSTEM_PRESETS, BUILTIN_FEATURES } from "@/types/actions";
import { BuiltinIcon } from "@/components/BuiltinIcon";

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

export function BindingModal({ keyId, initialAction, onClose, onSave, onClear }: BindingModalProps) {
  const [activeType, setActiveType] = useState<ActionType>(initialAction?.type ?? "app");

  // Form state for each type
  const [name, setName]       = useState(initialAction?.name ?? "");
  const [target, setTarget]   = useState((initialAction as AppAction | FolderAction | FileAction | UrlAction)?.target ?? "");
  const [host, setHost]       = useState((initialAction as SshAction)?.host ?? "");
  const [user, setUser]       = useState((initialAction as SshAction)?.user ?? "");
  const [port, setPort]       = useState(String((initialAction as SshAction)?.port ?? 22));
  const [shell, setShell]     = useState<"powershell"|"cmd"|"bat"|"wsl">((initialAction as ScriptAction)?.shell ?? "powershell");
  const [content, setContent] = useState((initialAction as ScriptAction)?.content ?? "");
  const [sysCmd, setSysCmd]   = useState((initialAction as SystemAction)?.command ?? "calculator");
  const [builtinFeature, setBuiltinFeature] = useState<BuiltinFeature>(
    (initialAction as BuiltinAction)?.feature ?? "clipboard"
  );

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

  const handleSave = () => {
    let action: Action | null = null;
    switch (activeType) {
      case "app":
        if (!target.trim()) return;
        action = { type: "app", name: name || target.split(/[\\/]/).pop() || "App", target: target.trim() };
        break;
      case "folder":
        if (!target.trim()) return;
        action = { type: "folder", name: name || "文件夹", target: target.trim() };
        break;
      case "file":
        if (!target.trim()) return;
        action = { type: "file", name: name || "文件", target: target.trim() };
        break;
      case "url":
        if (!target.trim()) return;
        action = { type: "url", name: name || target, target: target.trim() };
        break;
      case "ssh":
        if (!host.trim() || !user.trim()) return;
        action = { type: "ssh", name: name || `${user}@${host}`, host: host.trim(), user: user.trim(), port: Number(port) || 22 };
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
    if (action) onSave(action);
  };

  return (
    // Overlay
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div
        style={{
          width: 460,
          background: "rgba(22, 24, 40, 0.95)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
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
                  transition: "all 0.12s",
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Form body */}
        <div style={{ padding: "16px 16px 12px" }}>
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

          {/* URL */}
          {activeType === "url" && (
            <Field label="网址 *">
              <input
                style={INPUT_STYLE}
                placeholder="https://example.com"
                value={target}
                onChange={e => setTarget(e.target.value)}
              />
            </Field>
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
                    transition: "all 0.12s", outline: "none",
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
                    transition: "all 0.12s", outline: "none",
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
                onClick={onClear}
                style={{
                  padding: "6px 12px", borderRadius: 7, cursor: "pointer",
                  border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.10)",
                  color: "rgba(239,68,68,0.8)", fontSize: 12, fontWeight: 500,
                }}
              >
                清除绑定
              </button>
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
