import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import {
  fetchMarketplaceIndex,
  installPluginFromMarket,
  installPluginFromZip,
  listInstalledPlugins,
  setPluginEnabled,
  uninstallPlugin,
} from "@/plugins/api";
import type { InstalledPlugin, MarketplacePluginEntry } from "@/plugins/types";

const DEFAULT_MARKET_URL = "https://raw.githubusercontent.com/YiShengEasy/devLauncher/main/marketplace/marketplace.json";

const buttonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.72)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "7px 9px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.86)",
  outline: "none",
  fontSize: 12,
};

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: 12,
  background: "rgba(255,255,255,0.035)",
};

function PluginIcon({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          flex: "0 0 auto",
          background: "rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.74)",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={34}
      height={34}
      style={{
        flex: "0 0 auto",
        borderRadius: 8,
        objectFit: "cover",
        background: "rgba(255,255,255,0.08)",
      }}
      onError={() => setFailed(true)}
    />
  );
}

export function PluginCenter() {
  const [marketUrl, setMarketUrl] = useState(DEFAULT_MARKET_URL);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [market, setMarket] = useState<MarketplacePluginEntry[]>([]);
  const [status, setStatus] = useState("");

  async function refreshInstalled() {
    setPlugins(await listInstalledPlugins());
  }

  async function notifyPluginsChanged() {
    await emit("plugins-changed");
  }

  useEffect(() => {
    refreshInstalled().catch((error) => setStatus(String(error)));
  }, []);

  async function loadMarket() {
    const url = marketUrl.trim();
    if (!url) {
      setStatus("请输入市场地址。");
      return;
    }

    try {
      const index = await fetchMarketplaceIndex(url);
      setMarket(index.plugins);
      setStatus("市场已刷新。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function installLocalZip() {
    const result = await dialogOpen({
      multiple: false,
      directory: false,
      filters: [{ name: "DevLauncher Plugin", extensions: ["zip"] }],
    });
    if (typeof result !== "string") return;

    try {
      await installPluginFromZip(result);
      await refreshInstalled();
      await notifyPluginsChanged();
      setStatus("插件已安装。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function installMarket(entry: MarketplacePluginEntry) {
    try {
      await installPluginFromMarket(entry);
      await refreshInstalled();
      await notifyPluginsChanged();
      setStatus("插件已安装。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function toggle(plugin: InstalledPlugin) {
    try {
      setPlugins(await setPluginEnabled(plugin.id, !plugin.enabled));
      await notifyPluginsChanged();
      setStatus(plugin.enabled ? "插件已禁用。" : "插件已启用。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function remove(plugin: InstalledPlugin) {
    try {
      setPlugins(await uninstallPlugin(plugin.id));
      await notifyPluginsChanged();
      setStatus("插件已卸载。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={panelStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>插件市场</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 8 }}>
          <input
            value={marketUrl}
            onChange={(event) => setMarketUrl(event.target.value)}
            placeholder={DEFAULT_MARKET_URL}
            style={inputStyle}
          />
          <button type="button" onClick={loadMarket} style={buttonStyle}>刷新</button>
          <button type="button" onClick={installLocalZip} style={buttonStyle}>本地安装</button>
        </div>

        <div style={{ marginTop: 10 }}>
          {market.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>暂无市场插件。</div>
          ) : market.map((entry) => (
            <div
              key={`${entry.id}:${entry.version}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 0",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
                <PluginIcon src={entry.icon} name={entry.name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                    {entry.description ?? entry.id} / {entry.version}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => installMarket(entry)} style={buttonStyle}>安装</button>
            </div>
          ))}
        </div>
      </section>

      <section style={panelStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>已安装</div>
        {plugins.length === 0 ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>暂无插件。</div>
        ) : plugins.map((plugin) => (
          <div
            key={plugin.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 0",
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <PluginIcon
                src={plugin.iconPath ? convertFileSrc(plugin.iconPath) : undefined}
                name={plugin.manifest.name}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{plugin.manifest.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                  {plugin.id} / {plugin.version} / {plugin.enabled ? "已启用" : "已禁用"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => toggle(plugin)} style={buttonStyle}>
                {plugin.enabled ? "禁用" : "启用"}
              </button>
              <button type="button" onClick={() => remove(plugin)} style={buttonStyle}>卸载</button>
            </div>
          </div>
        ))}
      </section>

      {status && (
        <div style={{ fontSize: 12, color: status.includes("已") ? "rgba(74,222,128,0.86)" : "rgba(248,113,113,0.9)" }}>
          {status}
        </div>
      )}
    </div>
  );
}
