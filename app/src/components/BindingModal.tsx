import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import type {
  Action, ActionType,
  AppAction, FolderAction, FileAction, UrlAction, SshAction, ScriptAction, SystemAction, BuiltinAction, BuiltinFeature, SshTerminal, FolderOpenWith, SystemCommand, PluginAction, WorkflowAction, WorkflowDefinition
} from "@/types/actions";
import { ACTION_TYPE_META, SYSTEM_PRESETS, BUILTIN_FEATURES } from "@/types/actions";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CloseIcon, WorkflowIcon } from "@/icons";
import { animateDialogEnter, animateListEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { isMacPlatform } from "@/platform/shortcuts";
import { listInstalledPlugins } from "@/plugins/api";
import { pluginIconSrc } from "@/plugins/registry";
import type { InstalledPlugin } from "@/plugins/types";

interface BindingModalProps {
  keyId: string;
  bindingLabel?: string;
  initialAction?: Action | null;
  workflows?: WorkflowDefinition[];
  onClose: () => void;
  onSave: (action: Action) => void;
  onClear?: () => void;
}

const BASE_TABS: ActionType[] = ["app", "folder", "file", "url", "ssh", "script", "builtin"];
const MAC_UNSUPPORTED_SYSTEM_COMMANDS = new Set<SystemCommand>(["taskmanager", "shutdown", "restart"]);

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

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

export function BindingModal({ keyId, bindingLabel, initialAction, workflows, onClose, onSave, onClear }: BindingModalProps) {
  const displayLabel = bindingLabel ?? keyId;
  const title = bindingLabel ? "绑定" : "绑定按键";
  const isMac = isMacPlatform();
  const [activeType, setActiveType] = useState<ActionType>(initialAction?.type ?? "app");
  const [saveError, setSaveError] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const tabs = useMemo<ActionType[]>(
    () => workflows
      ? [...BASE_TABS, "workflow", "system", "plugin"]
      : [...BASE_TABS, "system", "plugin"],
    [workflows],
  );

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
  const initialSshAction = initialAction?.type === "ssh" ? initialAction as SshAction : null;
  const initialSshTerminal = (initialAction as SshAction)?.terminal ?? "auto";
  const safeInitialSshTerminal = isMac && initialSshTerminal !== "terminal" ? "terminal" : initialSshTerminal;
  const [sshTerminal, setSshTerminal] = useState<SshTerminal>(safeInitialSshTerminal);
  const initialScriptShell = (initialAction as ScriptAction)?.shell;
  const safeInitialScriptShell = isMac ? "terminal" : (initialScriptShell ?? "powershell");
  const [shell, setShell] = useState<"powershell" | "cmd" | "bat" | "wsl" | "terminal">(safeInitialScriptShell);
  const [content, setContent] = useState((initialAction as ScriptAction)?.content ?? "");
  const initialSystemCommand = (initialAction as SystemAction)?.command ?? "calculator";
  const safeInitialSystemCommand = isMac && MAC_UNSUPPORTED_SYSTEM_COMMANDS.has(initialSystemCommand)
    ? "calculator"
    : initialSystemCommand;
  const [sysCmd, setSysCmd] = useState<SystemCommand>(safeInitialSystemCommand);
  const [builtinFeature, setBuiltinFeature] = useState<BuiltinFeature>(
    (initialAction as BuiltinAction)?.feature ?? "clipboard"
  );
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [pluginLoadError, setPluginLoadError] = useState("");
  const pluginOptions = useMemo(() => (
    plugins
      .filter((plugin) => plugin.enabled)
      .flatMap((plugin) => plugin.manifest.actions.map((pluginAction) => ({
        plugin,
        action: pluginAction,
        key: `${plugin.id}:${pluginAction.id}`,
      })))
  ), [plugins]);
  const initialPluginAction = initialAction?.type === "plugin" ? initialAction as PluginAction : null;
  const firstPluginOptionKey = pluginOptions[0]?.key ?? "";
  const [pluginSelection, setPluginSelection] = useState(
    initialPluginAction ? `${initialPluginAction.pluginId}:${initialPluginAction.actionId}` : "",
  );
  const initialWorkflowAction = initialAction?.type === "workflow" ? initialAction as WorkflowAction : null;
  const [workflowSelection, setWorkflowSelection] = useState(initialWorkflowAction?.workflowId ?? "");
  const workflowOptions = workflows ?? [];

  useEffect(() => {
    listInstalledPlugins()
      .then((items) => {
        setPlugins(items);
        setPluginLoadError("");
      })
      .catch((error) => {
        setPlugins([]);
        setPluginLoadError(String(error));
      });
  }, []);

  useEffect(() => {
    if (pluginSelection || !firstPluginOptionKey) return;
    setPluginSelection(firstPluginOptionKey);
  }, [firstPluginOptionKey, pluginSelection]);

  useEffect(() => {
    if (workflowSelection || workflowOptions.length === 0) return;
    const firstEnabled = workflowOptions.find((workflow) => workflow.enabled);
    setWorkflowSelection(firstEnabled?.id ?? workflowOptions[0].id);
  }, [workflowOptions, workflowSelection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || confirmRequest) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmRequest, onClose]);

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animateDialogEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(listRef, () => {
    const children = listRef.current?.children;
    if (!children?.length) return;
    animateListEnter(Array.from(children), reducedMotion);
  }, [activeType, folderOpenWith, webAutofill, webHasPassword, sshHasPassword, pluginOptions.length, workflowOptions.length, reducedMotion]);

  const systemPresets = isMac
    ? SYSTEM_PRESETS.filter((preset) => !MAC_UNSUPPORTED_SYSTEM_COMMANDS.has(preset.command))
    : SYSTEM_PRESETS;

  const handleBrowseApp = async () => {
    const result = await dialogOpen({
      multiple: false,
      directory: false,
      filters: [{ name: "程序", extensions: isMac ? ["app"] : ["exe", "cmd", "bat", "lnk"] }],
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
        if (!target.trim()) {
          setSaveError("请选择或输入程序路径。");
          return;
        }
        action = { type: "app", name: name || target.split(/[\\/]/).pop() || "App", target: target.trim() };
        break;
      case "folder":
        if (!target.trim()) {
          setSaveError("请选择或输入目录路径。");
          return;
        }
        if (folderOpenWith === "custom" && !customOpener.trim()) {
          setSaveError("请选择自定义打开工具。");
          return;
        }
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
        if (!target.trim()) {
          setSaveError("请选择或输入文件路径。");
          return;
        }
        action = { type: "file", name: name || "文件", target: target.trim() };
        break;
      case "url":
        if (!target.trim()) {
          setSaveError("请输入网址。");
          return;
        }
        if (!getUrlOrigin(target)) {
          setSaveError("请输入包含 http:// 或 https:// 的有效网址。");
          return;
        }
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
        if (!host.trim() || !user.trim()) {
          setSaveError("请填写主机地址和用户名。");
          return;
        }
        if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
          setSaveError("端口需要是 1 到 65535 的整数。");
          return;
        }
        {
          const willHavePassword = sshHasPassword || sshPassword.length > 0;
          action = { type: "ssh", name: name || `${user}@${host}`, host: host.trim(), user: user.trim(), port: Number(port) || 22, terminal: sshTerminal, ...(willHavePassword ? { hasPassword: true } : {}) };
        }
        break;
      case "script":
        if (!content.trim()) {
          setSaveError("请输入脚本内容。");
          return;
        }
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
      case "plugin": {
        const selected = pluginOptions.find((option) => option.key === pluginSelection);
        if (!selected) {
          setSaveError("请先安装并启用插件。");
          return;
        }
        const pluginName = selected.plugin.manifest.name || selected.action.title;
        action = {
          type: "plugin",
          name: name || pluginName,
          pluginId: selected.plugin.id,
          actionId: selected.action.id,
          icon: pluginIconSrc(selected.plugin.iconPath),
        } as PluginAction;
        break;
      }
      case "workflow": {
        const selected = workflowOptions.find((workflow) => workflow.id === workflowSelection);
        if (!selected) {
          setSaveError("请先在工作流编排器中保存工作流。");
          return;
        }
        if (!selected.enabled) {
          setSaveError("该工作流已停用，请先启用后再绑定。");
          return;
        }
        action = {
          type: "workflow",
          name: selected.name,
          workflowId: selected.id,
        } as WorkflowAction;
        break;
      }
    }
    if (action) {
      // Persist SSH password to OS credential store (never saved in YAML config)
      if (activeType === "ssh") {
        const sshAction = action as SshAction;
        const credKey = `ssh:${sshAction.user}@${sshAction.host}:${sshAction.port ?? 22}`;
        const initialCredKey = initialSshAction
          ? `ssh:${initialSshAction.user}@${initialSshAction.host}:${initialSshAction.port ?? 22}`
          : null;
        const credentialKeyChanged = Boolean(initialCredKey && initialCredKey !== credKey);

        if (credentialKeyChanged && initialSshAction?.hasPassword && sshPassword.length === 0) {
          setSaveError("修改 SSH 主机、用户名或端口时，请重新输入密码。");
          return;
        }

        if (sshPassword.length > 0) {
          try {
            await invoke("save_ssh_password", { key: credKey, password: sshPassword });
            if (credentialKeyChanged && initialCredKey && initialSshAction?.hasPassword) {
              await invoke("delete_ssh_password", { key: initialCredKey });
            }
          } catch (error) {
            console.error(error);
            setSaveError(`保存 SSH 密码失败：${String(error)}`);
            return;
          }
        }
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
      className="theme-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirmRequest) onClose();
      }}
      style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
        padding: 18,
        background: "rgba(3,7,18,0.52)",
      }}

    >
      {/* Panel */}
      <div
        ref={rootRef}
        className="motion-dialog theme-dialog-surface"
        style={{
          width: 800,
          maxWidth: "calc(100vw - 32px)",
          height: "min(640px, calc(100vh - 36px))",
          minHeight: 0,
          display: "flex", flexDirection: "column",
          background: "var(--theme-bg, rgba(22, 24, 40, 0.97))",
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
            {title} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>[{displayLabel}]</span>
          </span>
          <button
            type="button"
            aria-label="关闭绑定弹框"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              background: "none",
              border: "none",
              borderRadius: 7,
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <CloseIcon size={14} decorative />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "138px minmax(0, 1fr)", flex: 1, minHeight: 0 }}>
          {/* Action type navigation */}
          <aside
            aria-label="绑定类型"
            style={{
              padding: 10,
              borderRight: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.10)",
              overflow: "hidden",
            }}
          >
            {tabs.map((t) => {
              const meta = ACTION_TYPE_META[t];
              const active = t === activeType;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setActiveType(t);
                    setSaveError("");
                  }}
                  style={{
                    width: "100%",
                    minHeight: 34,
                    marginBottom: 5,
                    padding: "7px 10px",
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 650,
                    cursor: "pointer",
                    textAlign: "left",
                    border: active ? `1px solid ${meta.color}55` : "1px solid rgba(255,255,255,0.07)",
                    outline: "none",
                    background: active ? `${meta.color}1f` : "rgba(255,255,255,0.035)",
                    color: active ? meta.color : "rgba(255,255,255,0.48)",
                  }}
                >
                  {meta.label}
                </button>
              );
            })}
          </aside>

          {/* Form body */}
          <div ref={listRef} className="motion-scroll-area" style={{ padding: "16px 16px 12px" }}>
          {/* Name field (common) */}
          {activeType !== "system" && activeType !== "builtin" && activeType !== "workflow" && (
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
                  placeholder={isMac ? "/Applications/App.app" : "C:\\Program Files\\...\\app.exe"}
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
                    placeholder={activeType === "folder" ? (isMac ? "/Users/me/Project" : "D:\\Project") : (isMac ? "/Users/me/document.pdf" : "D:\\document.pdf")}
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
                  <option value="explorer" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>{isMac ? "Finder" : "文件资源管理器"}</option>
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
                          placeholder={isMac ? "/Applications/App.app" : "C:\\Program Files\\...\\app.exe"}
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
                          onClick={() => {
                            setConfirmRequest({
                              title: "清除网页密码",
                              message: "将从系统凭据库中删除这个账号保存的密码。此操作不会删除按键绑定。",
                              confirmLabel: "清除密码",
                              onConfirm: async () => {
                                const origin = getUrlOrigin(target);
                                try {
                                  if (origin && webUsername.trim()) {
                                    await invoke("delete_web_password", { origin, username: webUsername.trim() });
                                  }
                                } catch (error) {
                                  setConfirmRequest(null);
                                  setSaveError(`清除网页密码失败：${String(error)}`);
                                  return;
                                }
                                setWebHasPassword(false);
                                setWebPassword("");
                                setConfirmRequest(null);
                              },
                            });
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
                      onClick={() => {
                        setConfirmRequest({
                          title: "清除 SSH 密码",
                          message: "将从系统凭据库中删除这个连接保存的密码。此操作不会删除按键绑定。",
                          confirmLabel: "清除密码",
                          onConfirm: async () => {
                            const credKey = `ssh:${user.trim()}@${host.trim()}:${Number(port) || 22}`;
                            try {
                              await invoke("delete_ssh_password", { key: credKey });
                            } catch (error) {
                              setConfirmRequest(null);
                              setSaveError(`清除 SSH 密码失败：${String(error)}`);
                              return;
                            }
                            setSshHasPassword(false);
                            setSshPassword("");
                            setConfirmRequest(null);
                          },
                        });
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
                  {!isMac && <option value="auto" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>自动（优先 Windows Terminal）</option>}
                  {!isMac && <option value="wt" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Windows Terminal (wt.exe)</option>}
                  {!isMac && <option value="cmd" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>CMD</option>}
                  {!isMac && <option value="powershell" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>PowerShell</option>}
                  {!isMac && <option value="gitbash" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Git Bash（支持 expect 自动密码）</option>}
                  <option value="terminal" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>内置终端</option>
                </select>
                {!isMac && sshTerminal === "gitbash" && (
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
                  {!isMac && <option value="powershell" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>PowerShell</option>}
                  {!isMac && <option value="cmd" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>CMD</option>}
                  {!isMac && <option value="bat" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Bat 文件</option>}
                  {!isMac && <option value="wsl" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>WSL (Ubuntu)</option>}
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
              {systemPresets.map(p => (
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

          {/* Plugin */}
          {activeType === "plugin" && (
            <div style={{ display: "grid", gap: 8 }}>
              {pluginLoadError && (
                <div style={{ fontSize: 12, color: "rgba(248,113,113,0.9)", lineHeight: 1.5 }}>
                  {pluginLoadError}
                </div>
              )}
              {pluginOptions.length === 0 ? (
                <div style={{
                  padding: 12,
                  borderRadius: 9,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}>
                  暂无可绑定插件。请先在设置的“插件中心”安装并启用插件。
                </div>
              ) : pluginOptions.map(({ plugin, action: pluginAction, key }) => (
                <button
                  key={key}
                  onClick={() => {
                    setPluginSelection(key);
                    if (!name) setName(plugin.manifest.name || pluginAction.title);
                  }}
                  type="button"
                  style={{
                    padding: "12px 10px",
                    borderRadius: 10,
                    cursor: "pointer",
                    border: `1px solid ${pluginSelection === key ? "rgba(167,243,208,0.55)" : "rgba(255,255,255,0.08)"}`,
                    background: pluginSelection === key ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.04)",
                    color: "#e8eaf0",
                    textAlign: "left",
                    display: "grid",
                    gap: 5,
                    outline: "none",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{pluginAction.title}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", lineHeight: 1.4 }}>
                    {plugin.manifest.name} / {plugin.id} / {plugin.version}
                  </span>
                </button>
              ))}
            </div>
          )}

          {activeType === "workflow" && (
            <div style={{ display: "grid", gap: 8 }}>
              {workflowOptions.length === 0 ? (
                <div style={{
                  padding: 14,
                  borderRadius: 9,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  lineHeight: 1.7,
                }}>
                  暂无已保存工作流。请先在工作流编排器中创建并保存。
                </div>
              ) : workflowOptions.map((workflow) => {
                const selected = workflowSelection === workflow.id;
                return (
                  <button
                    key={workflow.id}
                    type="button"
                    disabled={!workflow.enabled}
                    onClick={() => setWorkflowSelection(workflow.id)}
                    style={{
                      minHeight: 64,
                      padding: "10px 11px",
                      borderRadius: 9,
                      cursor: workflow.enabled ? "pointer" : "not-allowed",
                      border: selected
                        ? "1px solid rgba(96,165,250,0.55)"
                        : "1px solid rgba(255,255,255,0.08)",
                      background: selected
                        ? "rgba(59,130,246,0.14)"
                        : "rgba(255,255,255,0.04)",
                      color: "#e8eaf0",
                      textAlign: "left",
                      display: "grid",
                      gridTemplateColumns: "34px minmax(0, 1fr)",
                      alignItems: "center",
                      gap: 10,
                      opacity: workflow.enabled ? 1 : 0.48,
                      outline: "none",
                    }}
                  >
                    <span style={{
                      width: 32,
                      height: 32,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 8,
                      border: "1px solid rgba(96,165,250,0.24)",
                      background: "rgba(59,130,246,0.1)",
                    }}>
                      <WorkflowIcon size={17} decorative />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                        {workflow.name}
                      </strong>
                      <span style={{ display: "block", marginTop: 5, color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
                        {workflow.steps.filter((step) => step.enabled).length} 个启用步骤
                        {workflow.enabled ? "" : " · 已停用"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          </div>
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
                onClick={() => {
                  setConfirmRequest({
                    title: "清除按键绑定",
                    message: `将移除 ${displayLabel} 的绑定，并删除关联的已保存密码。`,
                    confirmLabel: "清除绑定",
                    onConfirm: async () => {
                      if (initialAction.type === "ssh" && (initialAction as SshAction).hasPassword) {
                        const a = initialAction as SshAction;
                        try {
                          await invoke("delete_ssh_password", {
                            key: `ssh:${a.user}@${a.host}:${a.port ?? 22}`,
                          });
                        } catch (error) {
                          setConfirmRequest(null);
                          setSaveError(`删除 SSH 密码失败：${String(error)}`);
                          return;
                        }
                      }
                      if (initialAction.type === "url" && (initialAction as UrlAction).hasPassword) {
                        const a = initialAction as UrlAction;
                        const origin = getUrlOrigin(a.target);
                        if (origin && a.username) {
                          try {
                            await invoke("delete_web_password", {
                              origin,
                              username: a.username,
                            });
                          } catch (error) {
                            setConfirmRequest(null);
                            setSaveError(`删除网页密码失败：${String(error)}`);
                            return;
                          }
                        }
                      }
                      setConfirmRequest(null);
                      onClear();
                    },
                  });
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
      {confirmRequest && (
        <ConfirmDialog
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmLabel={confirmRequest.confirmLabel}
          onConfirm={confirmRequest.onConfirm}
          onCancel={() => setConfirmRequest(null)}
        />
      )}
    </div>
  );
}
