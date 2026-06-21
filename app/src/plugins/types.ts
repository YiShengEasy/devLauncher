export type PluginKind = "webview";
export type PluginSource = "local" | "market";

export interface PluginManifestAction {
  id: string;
  title: string;
  type: "webview";
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  description?: string;
  entry: string;
  icon?: string;
  actions: PluginManifestAction[];
}

export interface InstalledPlugin {
  id: string;
  version: string;
  enabled: boolean;
  source: PluginSource;
  installedAt: number;
  manifest: PluginManifest;
}

export interface MarketplacePluginEntry {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  description?: string;
  downloadUrl: string;
  sha256: string;
  icon?: string;
}

export interface MarketplaceIndex {
  version: 1;
  plugins: MarketplacePluginEntry[];
}
