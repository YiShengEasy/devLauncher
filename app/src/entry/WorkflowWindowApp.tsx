import { useCallback, useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadConfig, saveConfig } from "@/api/config";
import { MacWindowControls } from "@/components/MacWindowControls";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { WorkflowIcon } from "@/icons";
import type { KeyboardConfig } from "@/types/actions";

const WINDOW_SURFACE = {
  width: "100vw",
  height: "100vh",
  minWidth: 0,
  minHeight: 0,
  boxSizing: "border-box" as const,
  display: "flex",
  flexDirection: "column" as const,
  overflow: "hidden",
  borderRadius: 14,
  clipPath: "inset(0 round 14px)",
  isolation: "isolate" as const,
  background: "var(--theme-bg, rgba(17,20,27,0.94))",
  border: "1px solid var(--theme-border, rgba(255,255,255,0.1))",
  color: "rgba(244,247,255,0.9)",
};

export function WorkflowWindowApp() {
  const [config, setConfig] = useState<KeyboardConfig | null>(null);
  const [error, setError] = useState("");

  const reloadConfig = useCallback(async () => {
    try {
      const nextConfig = await loadConfig();
      setConfig(nextConfig);
      setError("");
    } catch (nextError) {
      setError(String(nextError));
    }
  }, []);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  const closeWindow = useCallback(() => {
    void getCurrentWindow().close();
  }, []);

  const saveWorkflowConfig = useCallback(async (nextConfig: KeyboardConfig) => {
    const latestConfig = await loadConfig();
    const expectedRevision = Math.max(0, (nextConfig.revision ?? 0) - 1);
    if ((latestConfig.revision ?? 0) !== expectedRevision) {
      setConfig(latestConfig);
      throw new Error("工作流已被 MCP 或其他窗口更新，已载入最新配置，请确认后重试。");
    }

    await saveConfig(nextConfig);
    setConfig(nextConfig);
    await emit("workflow-config-saved", { revision: nextConfig.revision });
  }, []);

  if (config) {
    return (
      <div className="theme-window-surface" style={WINDOW_SURFACE}>
        <WorkflowPanel
          config={config}
          onSaveConfig={saveWorkflowConfig}
          onClose={closeWindow}
        />
      </div>
    );
  }

  return (
    <div className="theme-window-surface" style={WINDOW_SURFACE}>
      <div
        data-tauri-drag-region
        style={{
          height: 56,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 14px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <WorkflowIcon size={17} decorative />
        <strong style={{ fontSize: 13 }}>工作流编排器</strong>
        <MacWindowControls
          onClose={closeWindow}
          closeTitle="关闭工作流"
          style={{ marginLeft: "auto" }}
        />
      </div>
      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.52)", fontSize: 12 }}>
          <div>{error || "正在载入工作流..."}</div>
          {error && (
            <button
              type="button"
              onClick={() => void reloadConfig()}
              style={{
                marginTop: 14,
                height: 32,
                padding: "0 14px",
                borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.82)",
                cursor: "pointer",
              }}
            >
              重新载入
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
