import { useEffect, useMemo, useState } from "react";
import { getPluginEntryUrl } from "./api";

export function PluginHostApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const pluginId = params.get("pluginId") ?? "";
  const actionId = params.get("actionId") ?? "";
  const [entryUrl, setEntryUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pluginId || !actionId) {
      setError("缺少插件参数。");
      return;
    }

    getPluginEntryUrl(pluginId, actionId)
      .then((path) => {
        setEntryUrl(`file://${path}`);
        setError("");
      })
      .catch((err) => {
        setError(String(err));
        setEntryUrl("");
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

  if (!entryUrl) {
    return <div style={{ minHeight: "100vh", background: "#101622" }} />;
  }

  return (
    <iframe
      title={pluginId}
      src={entryUrl}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      style={{ width: "100vw", height: "100vh", border: 0, display: "block", background: "#fff" }}
    />
  );
}
