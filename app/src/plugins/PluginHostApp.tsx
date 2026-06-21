import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getPluginEntryContent } from "./api";

function withBaseUrl(html: string, baseUrl: string) {
  const base = `<base href="${convertFileSrc(baseUrl)}/">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
  }
  return `${base}${html}`;
}

export function PluginHostApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const pluginId = params.get("pluginId") ?? "";
  const actionId = params.get("actionId") ?? "";
  const [entryHtml, setEntryHtml] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pluginId || !actionId) {
      setError("缺少插件参数。");
      return;
    }

    getPluginEntryContent(pluginId, actionId)
      .then((content) => {
        setEntryHtml(withBaseUrl(content.html, content.baseUrl));
        setError("");
      })
      .catch((err) => {
        setError(String(err));
        setEntryHtml("");
      });
  }, [pluginId, actionId]);

  if (error) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#101622",
        color: "rgba(255,255,255,0.84)",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}>
        <div style={{ maxWidth: 520, padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>插件无法打开</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.58)" }}>{error}</div>
        </div>
      </div>
    );
  }

  const closeWindow = () => {
    getCurrentWindow().close().catch(console.error);
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      gridTemplateRows: "44px minmax(0, 1fr)",
      background: "#101622",
      color: "rgba(255,255,255,0.86)",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    }}>
      <header
        data-tauri-drag-region
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "0 12px 0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(16,22,34,0.92)",
          userSelect: "none",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 13,
            fontWeight: 800,
          }}>
            {pluginId || "DevLauncher Plugin"}
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭插件窗口"
          onClick={closeWindow}
          style={{
            width: 28,
            height: 28,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.78)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </header>
      {entryHtml ? (
        <iframe
          title={pluginId}
          srcDoc={entryHtml}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#fff" }}
        />
      ) : (
        <div style={{ minHeight: 0, background: "#101622" }} />
      )}
    </div>
  );
}
