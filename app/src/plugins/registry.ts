import type { LauncherActionRecord } from "@/launcher/actionIndex";
import type { PluginAction } from "@/types/actions";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { InstalledPlugin } from "./types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => normalize(value ?? "")).filter(Boolean)));
}

export function pluginIconSrc(iconPath?: string): string | undefined {
  if (!iconPath) return undefined;
  if (/^(https?:|data:|blob:)/i.test(iconPath)) return iconPath;
  if (typeof window === "undefined") return iconPath;
  return convertFileSrc(iconPath);
}

export function buildPluginActionRecords(plugins: InstalledPlugin[]): LauncherActionRecord[] {
  return plugins.flatMap((plugin) => {
    if (!plugin.enabled) return [];

    return plugin.manifest.actions.map((manifestAction) => {
      const action: PluginAction = {
        type: "plugin",
        name: manifestAction.title,
        pluginId: plugin.id,
        actionId: manifestAction.id,
        icon: pluginIconSrc(plugin.iconPath),
      };

      return {
        id: `plugin:${plugin.id}:${manifestAction.id}`,
        title: manifestAction.title,
        subtitle: plugin.manifest.description ?? plugin.manifest.name,
        source: "plugin" as const,
        actionKind: "execute-action" as const,
        action,
        keywords: unique([
          plugin.id,
          plugin.manifest.name,
          plugin.manifest.description,
          manifestAction.id,
          manifestAction.title,
        ]),
      };
    });
  });
}
