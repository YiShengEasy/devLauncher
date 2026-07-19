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
  iconPath?: string;
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

export interface MarketplaceWorkflowTemplatePackage {
  id: string;
  name: string;
  version: string;
  description?: string;
  templates: import("@/api/workflowTemplates").WorkflowTemplateDefinition[];
}

export interface MarketplaceIndex {
  version: 1;
  plugins: MarketplacePluginEntry[];
  workflowTemplatePackages?: MarketplaceWorkflowTemplatePackage[];
}

export interface PluginEntryContent {
  html: string;
  baseUrl: string;
}
