import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabledApi } from "@tauri-apps/plugin-autostart";
import type { CSSProperties } from "react";
import { loadConfig, saveConfig } from "@/api/config";
import {
  generateCloudSyncKey,
  getCloudSyncStatus,
  restoreLatestCloudSyncSnapshot,
  saveCloudSyncKey,
  uploadCloudSyncSnapshot,
  type CloudSyncSnapshotMeta,
} from "@/api/cloudSync";
import { ActionIcon } from "@/components/ActionIcon";
import { BindingModal } from "@/components/BindingModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MacWindowControls } from "@/components/MacWindowControls";
import { PluginCenter } from "@/components/PluginCenter";
import { writePetCodexEnabled } from "@/entry/petCodexStatus";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { getGlobalShortcutLabels } from "@/platform/shortcuts";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { ACTION_TYPE_META, DEFAULT_THEME, PET_CUSTOM_ACTION_SLOT_COUNT } from "@/types/actions";
import type { Action, KeyId, KeyMap, KeyboardConfig, ThemeConfig, UrlAction } from "@/types/actions";

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

type VisualThemePreset = Omit<ThemeConfig, "showKeyLabels">;

const THEME_PRESETS: { name: string; theme: VisualThemePreset }[] = [
  {
    name: "经典黑",
    theme: {
      bgColor: DEFAULT_THEME.bgColor,
      bgOpacity: DEFAULT_THEME.bgOpacity,
      blurRadius: DEFAULT_THEME.blurRadius,
      borderColor: DEFAULT_THEME.borderColor,
      keyBgOpacity: DEFAULT_THEME.keyBgOpacity,
    },
  },
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

type SettingsSection = "appearance" | "webaccounts" | "entries" | "cloudSync" | "plugins";

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

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
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

export function SettingsPanel({
  onClose,
  showWindowPin = true,
}: {
  onClose: () => void;
  showWindowPin?: boolean;
}) {
  const config = useKeyboardStore((s) => s.config);
  const theme = useKeyboardStore((s) => s.theme);
  const setTheme = useKeyboardStore((s) => s.setTheme);
  const shortcutLabels = getGlobalShortcutLabels();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const webAccounts = useMemo(() => getWebAccountEntries(config), [config]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [petMenuEditIndex, setPetMenuEditIndex] = useState<number | null>(null);
  const editingEntry = webAccounts.find((entry) => entry.id === editingId) ?? webAccounts[0] ?? null;
  const [editState, setEditState] = useState<EditState | null>(null);
  const [status, setStatus] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [cloudSyncBaseUrl, setCloudSyncBaseUrl] = useState("http://127.0.0.1:8787");
  const [cloudSyncKey, setCloudSyncKey] = useState("");
  const [cloudSyncMessage, setCloudSyncMessage] = useState("");
  const [cloudSyncLoading, setCloudSyncLoading] = useState<"status" | "generate" | "save" | "upload" | "restore" | null>(null);
  const [cloudSyncHasKey, setCloudSyncHasKey] = useState(false);
  const [cloudSyncLatest, setCloudSyncLatest] = useState<CloudSyncSnapshotMeta | null>(null);
  const [cloudSyncBackups, setCloudSyncBackups] = useState<string[]>([]);
  const [isAutostartEnabled, setIsAutostartEnabled] = useState(false);
  const [isAutostartLoading, setIsAutostartLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || confirmRequest || petMenuEditIndex !== null) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmRequest, onClose, petMenuEditIndex]);

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(contentRef, () => {
    const children = contentRef.current?.children;
    if (!children?.length) return;
    animateListEnter(Array.from(children), reducedMotion);
  }, [activeSection, webAccounts.length, editingId, reducedMotion]);

  useEffect(() => {
    let cancelled = false;

    isAutostartEnabledApi()
      .then((enabled) => {
        if (!cancelled) setIsAutostartEnabled(enabled);
      })
      .catch((error) => {
        if (!cancelled) setStatus(`读取开机自启动状态失败：${String(error)}`);
      })
      .finally(() => {
        if (!cancelled) setIsAutostartLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCloudSyncLoading("status");
    getCloudSyncStatus()
      .then((syncStatus) => {
        if (cancelled) return;
        setCloudSyncBaseUrl(syncStatus.baseUrl);
        setCloudSyncHasKey(syncStatus.hasSyncKey);
        setCloudSyncLatest(syncStatus.latestSnapshot ?? null);
        setCloudSyncMessage(syncStatus.hasSyncKey ? "云端同步已连接。" : "尚未保存同步密钥。");
      })
      .catch((error) => {
        if (!cancelled) setCloudSyncMessage(`读取同步状态失败：${String(error)}`);
      })
      .finally(() => {
        if (!cancelled) setCloudSyncLoading(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persistTheme = (partial: Partial<ThemeConfig>) => {
    setTheme(partial);
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  };

  const petMenuActions = useMemo(
    () => Array.from(
      { length: PET_CUSTOM_ACTION_SLOT_COUNT },
      (_, index) => config?.pet?.menu?.customActions?.[index] ?? null,
    ),
    [config],
  );

  async function persistPetMenuAction(index: number, action: Action | null) {
    if (!config) return;

    const nextActions = Array.from(
      { length: PET_CUSTOM_ACTION_SLOT_COUNT },
      (_, slotIndex) => slotIndex === index ? action : petMenuActions[slotIndex],
    );

    const nextConfig: KeyboardConfig = {
      ...config,
      pet: {
        ...config.pet,
        codex: {
          enabled: Boolean(config.pet?.codex?.enabled),
        },
        menu: {
          customActions: nextActions,
        },
      },
    };

    await persistConfig(nextConfig);
    await emit("pet-menu-config-changed", nextActions);
    setStatus(action ? "宠物菜单已更新。" : "宠物菜单绑定已清空。");
  }

  const applyPreset = (preset: VisualThemePreset) => {
    setTheme({ ...preset });
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  };

  const setPetCodexEnabled = async (enabled: boolean) => {
    if (!config) return;
    const next: KeyboardConfig = {
      ...config,
      pet: {
        ...config.pet,
        codex: {
          ...config.pet?.codex,
          enabled,
        },
        menu: {
          customActions: petMenuActions,
        },
      },
    };
    writePetCodexEnabled(enabled);
    await persistConfig(next);
    setStatus(enabled ? "Codex 联动已开启。未检测到状态事件时，宠物会显示未连接。" : "Codex 联动已关闭。");
  };

  const setAutostartEnabled = async (enabled: boolean) => {
    setIsAutostartLoading(true);
    try {
      if (enabled) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      const nextEnabled = await isAutostartEnabledApi();
      setIsAutostartEnabled(nextEnabled);
      setStatus(nextEnabled ? "开机自启动已开启。" : "开机自启动已关闭。");
    } catch (error) {
      setStatus(`开机自启动设置失败：${String(error)}`);
    } finally {
      setIsAutostartLoading(false);
    }
  };

  const refreshCloudSyncStatus = async () => {
    setCloudSyncLoading("status");
    try {
      const syncStatus = await getCloudSyncStatus();
      setCloudSyncBaseUrl(syncStatus.baseUrl);
      setCloudSyncHasKey(syncStatus.hasSyncKey);
      setCloudSyncLatest(syncStatus.latestSnapshot ?? null);
      setCloudSyncMessage(syncStatus.hasSyncKey ? "云端同步状态已刷新。" : "尚未保存同步密钥。");
    } catch (error) {
      setCloudSyncMessage(`读取同步状态失败：${String(error)}`);
    } finally {
      setCloudSyncLoading(null);
    }
  };

  const saveCloudSyncConnection = async () => {
    setCloudSyncLoading("save");
    setCloudSyncBackups([]);
    try {
      const syncStatus = await saveCloudSyncKey(cloudSyncKey, cloudSyncBaseUrl);
      setCloudSyncBaseUrl(syncStatus.baseUrl);
      setCloudSyncHasKey(syncStatus.hasSyncKey);
      setCloudSyncLatest(syncStatus.latestSnapshot ?? null);
      setCloudSyncKey("");
      setCloudSyncMessage("同步密钥已保存到本机凭据存储。请保存好密钥，新设备恢复时需要它，丢失后无法从本机找回。");
    } catch (error) {
      setCloudSyncMessage(`保存同步密钥失败：${String(error)}`);
    } finally {
      setCloudSyncLoading(null);
    }
  };

  const generateCloudSyncConnection = async () => {
    setCloudSyncLoading("generate");
    setCloudSyncBackups([]);
    try {
      const generated = await generateCloudSyncKey(cloudSyncBaseUrl, "primary");
      setCloudSyncBaseUrl(generated.status.baseUrl);
      setCloudSyncHasKey(generated.status.hasSyncKey);
      setCloudSyncLatest(generated.status.latestSnapshot ?? null);
      setCloudSyncKey(generated.syncKey);
      setCloudSyncMessage("已生成并保存同步密钥。请立即保存好输入框里的密钥，新设备恢复时需要它，丢失后无法找回。");
    } catch (error) {
      setCloudSyncMessage(`生成同步密钥失败：${String(error)}`);
    } finally {
      setCloudSyncLoading(null);
    }
  };

  const uploadCloudSync = async () => {
    if (!cloudSyncHasKey) {
      setCloudSyncMessage("请先输入同步密钥并点击“保存密钥”。");
      return;
    }

    setCloudSyncLoading("upload");
    setCloudSyncBackups([]);
    try {
      const snapshot = await uploadCloudSyncSnapshot();
      setCloudSyncLatest(snapshot);
      setCloudSyncHasKey(true);
      setCloudSyncMessage(`已上传云端快照：${new Date(snapshot.createdAt).toLocaleString()}`);
    } catch (error) {
      setCloudSyncMessage(`上传失败：${String(error)}`);
    } finally {
      setCloudSyncLoading(null);
    }
  };

  const performCloudSyncRestore = async () => {
    if (!cloudSyncHasKey) {
      setCloudSyncMessage("请先输入同步密钥并点击“保存密钥”。");
      return;
    }

    setCloudSyncLoading("restore");
    try {
      const result = await restoreLatestCloudSyncSnapshot();
      const restoredConfig = await loadConfig();
      useKeyboardStore.setState((state) => ({
        config: restoredConfig,
        theme: restoredConfig.theme ?? state.theme,
      }));
      setCloudSyncLatest(result.snapshot);
      setCloudSyncBackups(result.backupPaths);
      setCloudSyncMessage("已从云端恢复。网页/SSH 密码需要在本机重新录入。");
    } catch (error) {
      setCloudSyncMessage(`恢复失败：${String(error)}`);
    } finally {
      setCloudSyncLoading(null);
      setConfirmRequest(null);
    }
  };

  const restoreCloudSync = () => {
    if (!cloudSyncHasKey) {
      setCloudSyncMessage("请先输入同步密钥并点击“保存密钥”。");
      return;
    }
    setConfirmRequest({
      title: "从云端恢复配置",
      message: "云端配置将覆盖当前本机配置。恢复前会自动创建本地备份，网页与 SSH 密码不会从云端写入。",
      confirmLabel: "开始恢复",
      tone: "primary",
      onConfirm: performCloudSyncRestore,
    });
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

  const performClearPassword = async (entry: WebAccountEntry) => {
    if (!config || !entry.origin || !entry.action.username) return;

    try {
      await invoke("delete_web_password", {
        origin: entry.origin,
        username: entry.action.username,
      });
    } catch (error) {
      setStatus(`清除密码失败：${String(error)}`);
      setConfirmRequest(null);
      return;
    }

    const nextAction: UrlAction = { ...entry.action };
    delete nextAction.hasPassword;
    const pages = [...config.pages];
    const page = { ...pages[entry.pageIndex], keys: { ...pages[entry.pageIndex].keys } };
    page.keys[entry.keyId] = { action: nextAction };
    pages[entry.pageIndex] = page;
    await persistConfig({ ...config, pages });
    setStatus("密码已清除。");
    setConfirmRequest(null);
  };

  const clearPassword = (entry: WebAccountEntry) => {
    setConfirmRequest({
      title: "清除网页密码",
      message: `将从系统凭据库中删除“${entry.action.name}”保存的密码，网址绑定仍会保留。`,
      confirmLabel: "清除密码",
      onConfirm: () => performClearPassword(entry),
    });
  };

  const performRemoveBinding = async (entry: WebAccountEntry) => {
    if (!config) return;

    if (entry.action.hasPassword && entry.origin && entry.action.username) {
      try {
        await invoke("delete_web_password", {
          origin: entry.origin,
          username: entry.action.username,
        });
      } catch (error) {
        setStatus(`删除网页密码失败：${String(error)}`);
        setConfirmRequest(null);
        return;
      }
    }

    const pages = [...config.pages];
    const page = { ...pages[entry.pageIndex], keys: { ...pages[entry.pageIndex].keys } };
    page.keys[entry.keyId] = { action: null };
    pages[entry.pageIndex] = page;
    await persistConfig({ ...config, pages });
    setEditingId(null);
    setEditState(null);
    setStatus("绑定已移除。");
    setConfirmRequest(null);
  };

  const removeBinding = (entry: WebAccountEntry) => {
    setConfirmRequest({
      title: "移除网页账号绑定",
      message: `将移除“${entry.action.name}”的按键绑定，并删除关联的已保存密码。`,
      confirmLabel: "移除绑定",
      onConfirm: () => performRemoveBinding(entry),
    });
  };

  useEffect(() => {
    if (!editingEntry || editState) return;
    setEditingId(editingEntry.id);
    setEditState(editStateFromAction(editingEntry.action));
    setStatus("");
  }, [editState, editingEntry]);

  return (
    <>
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
	          ["cloudSync", "云同步"],
	          ["plugins", "插件"],
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
	            {activeSection === "appearance"
	              ? "外观设置"
	              : activeSection === "entries"
	                ? "入口设置"
	                : activeSection === "cloudSync"
	                  ? "云端同步"
	                  : activeSection === "plugins"
	                    ? "插件中心"
	                    : "URL 与账号密码本"}
          </div>
          <MacWindowControls onClose={onClose} closeTitle="关闭设置" showPin={showWindowPin} />
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

              <div style={LABEL}>按键图标文字</div>
              <div style={{ ...ROW, justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.62)" }}>
                  显示图标下方的名称
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={theme.showKeyLabels}
                  aria-label="显示图标下方的名称"
                  onClick={() => persistTheme({ showKeyLabels: !theme.showKeyLabels })}
                  style={{
                    width: 38,
                    height: 22,
                    padding: 2,
                    borderRadius: 11,
                    border: theme.showKeyLabels
                      ? "1px solid rgba(96,165,250,0.72)"
                      : "1px solid rgba(255,255,255,0.16)",
                    background: theme.showKeyLabels
                      ? "rgba(59,130,246,0.58)"
                      : "rgba(255,255,255,0.07)",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.24)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: theme.showKeyLabels ? "flex-end" : "flex-start",
                    flexShrink: 0,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: theme.showKeyLabels ? "#f8fbff" : "rgba(255,255,255,0.62)",
                      boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
                    }}
                  />
                </button>
              </div>
            </>
          ) : activeSection === "entries" ? (
            <section className="motion-list" style={{ padding: 2 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>入口</h2>
              <div style={{ ...panelStyle, padding: 12, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>开机自启动</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
                      登录系统后自动启动 DevLauncher，保持虚拟键盘、搜索和桌面宠物入口可用。
                    </div>
                  </div>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      color: "rgba(255,255,255,0.66)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: isAutostartLoading ? "default" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isAutostartEnabled}
                      disabled={isAutostartLoading}
                      onChange={(event) => setAutostartEnabled(event.target.checked)}
                    />
                    {isAutostartLoading ? "读取中" : "随系统启动"}
                  </label>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 8, lineHeight: 1.6 }}>
                  macOS 使用 LaunchAgent 登录项；Windows/Linux 由 Tauri 自启动插件按平台处理。
                </div>
              </div>
              <div style={{ ...panelStyle, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Search</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
                  快捷键：{shortcutLabels.search}。搜索键盘绑定、内置功能和最近动作。
                </div>
              </div>
              <div style={{ ...panelStyle, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Desktop pet</div>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      color: "rgba(255,255,255,0.66)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: config ? "pointer" : "default",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(config?.pet?.codex?.enabled)}
                      disabled={!config}
                      onChange={(event) => setPetCodexEnabled(event.target.checked).catch((error) => setStatus(String(error)))}
                    />
                    Codex 联动
                  </label>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
                  快捷键：{shortcutLabels.pet}。打开搜索、截图报告、剪切板、键盘模式和隐藏操作；可拖动并保存位置。
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", marginTop: 8, lineHeight: 1.6 }}>
                  关闭时不会连接或探测 Codex。开启后只接收状态事件；未安装或未启动 Codex 时显示未连接，不影响启动。
                </div>
                <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.76)", marginBottom: 8 }}>
                    菜单快捷入口
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    {petMenuActions.map((action, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setPetMenuEditIndex(index)}
                        disabled={!config}
                        title={action ? `${action.name} / ${ACTION_TYPE_META[action.type].label}` : `添加宠物菜单 ${index + 1}`}
                        style={{
                          minHeight: 72,
                          borderRadius: 9,
                          border: action ? "1px solid rgba(125,211,252,0.34)" : "1px dashed rgba(255,255,255,0.22)",
                          background: action ? "rgba(14,165,233,0.12)" : "rgba(255,255,255,0.045)",
                          color: "rgba(255,255,255,0.78)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 5,
                          cursor: config ? "pointer" : "default",
                          overflow: "hidden",
                        }}
                      >
                        {action ? (
                          <>
                            <ActionIcon action={action} size={24} />
                            <span style={{ fontSize: 11, fontWeight: 800, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {action.name}
                            </span>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                              {ACTION_TYPE_META[action.type].label}
                            </span>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>添加</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.42)", lineHeight: 1.6 }}>
                    宠物菜单固定保留键盘模式；这里最多添加 3 个自定义入口。
                  </div>
                </div>
                {status && (
                  <div style={{ marginTop: 8, color: status.includes("已") ? "rgba(74,222,128,0.86)" : "rgba(248,113,113,0.9)", fontSize: 11 }}>
                    {status}
                  </div>
                )}
              </div>
            </section>
	          ) : activeSection === "cloudSync" ? (
	            <section className="motion-list" style={{ padding: 2 }}>
	              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>云端同步</h2>
	              <div style={{ ...panelStyle, padding: 12, marginBottom: 12 }}>
	                <div style={{ fontSize: 13, fontWeight: 700 }}>同步密钥</div>
	                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6, lineHeight: 1.6 }}>
	                  用同步密钥连接你的私有同步服务。密钥会保存到本机凭据存储；真实密码、私钥和本地文件内容不会上传。
	                </div>
	                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 12 }}>
	                  <div>
	                    <div style={LABEL}>服务地址</div>
	                    <input
	                      style={INPUT}
	                      value={cloudSyncBaseUrl}
	                      onChange={(event) => setCloudSyncBaseUrl(event.target.value)}
	                      placeholder="http://127.0.0.1:8787"
	                    />
	                  </div>
	                  <div>
	                    <div style={LABEL}>同步密钥</div>
	                    <input
	                      style={INPUT}
	                      type="password"
	                      value={cloudSyncKey}
	                      onChange={(event) => setCloudSyncKey(event.target.value)}
	                      placeholder={cloudSyncHasKey ? "已保存，留空保持不变" : "输入 dlsk_..."}
	                      autoComplete="new-password"
	                    />
	                  </div>
	                </div>
	                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
	                  <button
	                    type="button"
	                    onClick={generateCloudSyncConnection}
	                    disabled={cloudSyncLoading !== null}
	                    style={{ ...BUTTON, background: "rgba(14,165,233,0.22)", color: "rgba(186,230,253,0.94)", borderColor: "rgba(125,211,252,0.28)" }}
	                  >
	                    {cloudSyncLoading === "generate" ? "生成中" : "生成并保存密钥"}
	                  </button>
	                  <button
	                    type="button"
	                    onClick={saveCloudSyncConnection}
	                    disabled={cloudSyncLoading !== null || !cloudSyncKey.trim()}
	                    style={BUTTON}
	                  >
	                    {cloudSyncLoading === "save" ? "保存中" : "保存密钥"}
	                  </button>
	                  <button
	                    type="button"
	                    onClick={refreshCloudSyncStatus}
	                    disabled={cloudSyncLoading !== null}
	                    style={BUTTON}
	                  >
	                    {cloudSyncLoading === "status" ? "刷新中" : "刷新状态"}
	                  </button>
	                </div>
	              </div>

	              <div style={{ ...panelStyle, padding: 12, marginBottom: 12 }}>
	                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
	                  <div>
	                    <div style={{ fontSize: 13, fontWeight: 700 }}>配置快照</div>
	                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6, lineHeight: 1.6 }}>
	                      上传当前 `keyboard.yaml` 与 QuickMemory 自定义数据；恢复时会先备份本机文件再覆盖。
	                    </div>
	                  </div>
	                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
	                    <button
	                      type="button"
	                      onClick={uploadCloudSync}
	                      disabled={cloudSyncLoading !== null}
	                      style={{ ...BUTTON, background: "rgba(37,99,235,0.70)", color: "#fff", borderColor: "rgba(96,165,250,0.32)" }}
	                    >
	                      {cloudSyncLoading === "upload" ? "上传中" : "上传当前配置"}
	                    </button>
	                    <button
	                      type="button"
	                      onClick={restoreCloudSync}
	                      disabled={cloudSyncLoading !== null}
	                      style={{ ...BUTTON, borderColor: "rgba(251,191,36,0.28)", color: "rgba(253,224,71,0.9)" }}
	                    >
	                      {cloudSyncLoading === "restore" ? "恢复中" : "从云端恢复"}
	                    </button>
	                  </div>
	                </div>
	                <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.46)", lineHeight: 1.7 }}>
	                  {cloudSyncLatest ? (
	                    <>
	                      最近快照：{new Date(cloudSyncLatest.createdAt).toLocaleString()}
	                      {cloudSyncLatest.deviceName ? ` / ${cloudSyncLatest.deviceName}` : ""}
	                      {cloudSyncLatest.appVersion ? ` / v${cloudSyncLatest.appVersion}` : ""}
	                    </>
	                  ) : (
	                    "暂无云端快照。"
	                  )}
	                </div>
	                {cloudSyncBackups.length > 0 && (
	                  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.42)", lineHeight: 1.7 }}>
	                    本机备份：{cloudSyncBackups.join(" / ")}
	                  </div>
	                )}
	              </div>

	              <div style={{ fontSize: 11, color: cloudSyncMessage.includes("失败") ? "rgba(248,113,113,0.9)" : "rgba(74,222,128,0.86)", lineHeight: 1.7 }}>
	                {cloudSyncMessage}
	              </div>
	            </section>
	          ) : activeSection === "plugins" ? (
	            <PluginCenter />
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
    {petMenuEditIndex !== null && (
      <BindingModal
        keyId={`pet-menu-${petMenuEditIndex + 1}`}
        bindingLabel={`宠物菜单 ${petMenuEditIndex + 1}`}
        initialAction={petMenuActions[petMenuEditIndex]}
        onClose={() => setPetMenuEditIndex(null)}
        onSave={(action) => {
          const index = petMenuEditIndex;
          if (index === null) return;
          setPetMenuEditIndex(null);
          void persistPetMenuAction(index, action).catch((error) => setStatus(String(error)));
        }}
        onClear={() => {
          const index = petMenuEditIndex;
          if (index === null) return;
          setPetMenuEditIndex(null);
          void persistPetMenuAction(index, null).catch((error) => setStatus(String(error)));
        }}
      />
    )}
    {confirmRequest && (
      <ConfirmDialog
        title={confirmRequest.title}
        message={confirmRequest.message}
        confirmLabel={confirmRequest.confirmLabel}
        tone={confirmRequest.tone}
        onConfirm={confirmRequest.onConfirm}
        onCancel={() => setConfirmRequest(null)}
      />
    )}
    </>
  );
}
