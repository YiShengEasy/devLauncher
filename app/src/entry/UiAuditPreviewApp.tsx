import { useLayoutEffect } from "react";
import { BindingModal } from "@/components/BindingModal";
import { KeyboardPanel } from "@/components/KeyboardPanel";
import { MacWindowControls } from "@/components/MacWindowControls";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SettingsIcon } from "@/icons";
import { DEFAULT_THEME, type KeyboardConfig } from "@/types/actions";
import { useKeyboardStore } from "@/store/useKeyboardStore";

const PREVIEW_CONFIG: KeyboardConfig = {
  theme: DEFAULT_THEME,
  pages: [
    {
      name: "开发",
      keys: {
        "1": { action: { type: "builtin", name: "截图", feature: "screenshot" } },
        "2": { action: { type: "builtin", name: "剪贴板", feature: "clipboard" } },
        "3": { action: { type: "builtin", name: "快捷记忆", feature: "quickmemory" } },
        Q: { action: { type: "app", name: "Visual Studio Code", target: "/Applications/Visual Studio Code.app" } },
        W: { action: { type: "folder", name: "项目", target: "/Users/demo/Projects", openWith: "vscode" } },
        E: { action: { type: "url", name: "GitHub", target: "https://github.com" } },
        R: { action: { type: "ssh", name: "生产服务器", host: "server.example.com", user: "dev", port: 22 } },
        A: { action: { type: "script", name: "运行测试", shell: "terminal", content: "npm test" } },
        S: { action: { type: "system", name: "锁屏", command: "lock" } },
      },
    },
    { name: "常用", keys: {} },
  ],
};

function LauncherShell() {
  const keys = PREVIEW_CONFIG.pages[0].keys;

  return (
    <div
      className="glass entry-mode-shell"
      style={{
        width: 900,
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "rgba(16, 22, 34, 0.95)",
        border: "1px solid rgba(119,119,140,0.47)",
        position: "relative",
      }}
    >
      <header
        style={{
          height: 50,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px 9px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.075)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/devlauncher-icon.png"
            alt=""
            style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }}
          />
          <span style={{ fontSize: 12, fontWeight: 650, color: "rgba(255,255,255,0.86)" }}>
            DevLauncher
          </span>
          <span style={{ width: 1, height: 13, background: "rgba(255,255,255,0.2)" }} />
          <span style={{ color: "rgba(222,227,238,0.58)", fontSize: 10 }}>
            一键启动你的开发工作流
          </span>
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <button
            type="button"
            style={{
              width: 94,
              height: 30,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.09)",
              background: "rgba(255,255,255,0.07)",
              color: "rgba(241,244,252,0.76)",
              fontSize: 11,
            }}
          >
            搜索
          </button>
          <button
            type="button"
            aria-label="设置"
            style={{
              width: 32,
              height: 30,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.09)",
              background: "rgba(255,255,255,0.07)",
              color: "rgba(241,244,252,0.76)",
              fontSize: 16,
            }}
          >
            <SettingsIcon size={17} decorative />
          </button>
          <MacWindowControls onClose={() => {}} onMinimize={() => {}} showPin={false} />
        </div>
      </header>
      <div
        style={{
          height: 37,
          display: "flex",
          alignItems: "flex-end",
          gap: 18,
          paddingLeft: 13,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {PREVIEW_CONFIG.pages.map((page, index) => (
          <button
            key={page.name}
            type="button"
            style={{
              height: 29,
              minWidth: 60,
              padding: "0 17px",
              borderRadius: "6px 6px 0 0",
              border: index === 0 ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
              borderBottom: index === 0 ? "3px solid #3f90ff" : "3px solid transparent",
              background: index === 0 ? "rgba(255,255,255,0.08)" : "transparent",
              color: index === 0 ? "#fbfcff" : "rgba(228,232,242,0.62)",
              fontSize: 12,
              fontWeight: 560,
            }}
          >
            {page.name}
          </button>
        ))}
      </div>
      <div style={{ padding: "16px 18px 18px" }}>
        <KeyboardPanel keys={keys} />
      </div>
    </div>
  );
}

export function UiAuditPreviewApp() {
  const state = new URLSearchParams(window.location.search).get("state") ?? "main";

  useLayoutEffect(() => {
    useKeyboardStore.getState().setConfig(PREVIEW_CONFIG);
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        background: "#111827",
      }}
    >
      <LauncherShell />
      {state === "settings" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(3,7,18,0.38)",
          }}
        >
          <div
            style={{
              width: 760,
              maxWidth: "92vw",
              height: "min(640px, 90vh)",
              borderRadius: 14,
              background: "rgba(16,22,34,0.98)",
              border: "1px solid rgba(119,119,140,0.47)",
              overflow: "hidden",
            }}
          >
            <SettingsPanel onClose={() => {}} showWindowPin={false} />
          </div>
        </div>
      )}
      {state === "binding" && (
        <BindingModal
          keyId="Q"
          initialAction={PREVIEW_CONFIG.pages[0].keys.Q?.action}
          onClose={() => {}}
          onSave={() => {}}
          onClear={() => {}}
        />
      )}
    </div>
  );
}
