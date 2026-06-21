import { invoke } from "@tauri-apps/api/core";
import type {
  InstalledPlugin,
  MarketplaceIndex,
  MarketplacePluginEntry,
  PluginEntryContent,
} from "./types";

export function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("list_installed_plugins");
}

export function installPluginFromZip(path: string): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("install_plugin_from_zip", { path });
}

export function fetchMarketplaceIndex(url: string): Promise<MarketplaceIndex> {
  return invoke<MarketplaceIndex>("fetch_marketplace_index", { url });
}

export function installPluginFromMarket(entry: MarketplacePluginEntry): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("install_plugin_from_market", { entry });
}

export function setPluginEnabled(pluginId: string, enabled: boolean): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("set_plugin_enabled", { pluginId, enabled });
}

export function uninstallPlugin(pluginId: string): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("uninstall_plugin", { pluginId });
}

export function getPluginEntryUrl(pluginId: string, actionId: string): Promise<string> {
  return invoke<string>("get_plugin_entry_url", { pluginId, actionId });
}

export function getPluginEntryContent(pluginId: string, actionId: string): Promise<PluginEntryContent> {
  return invoke<PluginEntryContent>("get_plugin_entry_content", { pluginId, actionId });
}
