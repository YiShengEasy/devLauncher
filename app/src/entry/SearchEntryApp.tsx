import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BUILTIN_REGISTRY } from "@/builtins/_registry";
import { loadConfig } from "@/api/config";
import type { KeyboardConfig } from "@/types/actions";
import {
  buildBuiltinActionRecords,
  buildKeyboardActionRecords,
  type LauncherActionRecord,
} from "@/launcher/actionIndex";
import { executeLauncherAction } from "@/launcher/actionExecutor";
import { loadRecentActions, recordRecentAction } from "@/launcher/recentActions";
import { listInstalledPlugins } from "@/plugins/api";
import { buildPluginActionRecords } from "@/plugins/registry";
import type { InstalledPlugin } from "@/plugins/types";
import { SearchPanel } from "./SearchPanel";
import { SEARCH_PREFILL_EVENT, type SearchPrefillPayload } from "./entryEvents";

function mergeActionRecords(records: LauncherActionRecord[]): LauncherActionRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

export function SearchEntryApp() {
  const [config, setConfig] = useState<KeyboardConfig | null>(null);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [recent, setRecent] = useState<LauncherActionRecord[]>([]);
  const [initialQuery, setInitialQuery] = useState("");

  useEffect(() => {
    loadConfig().then(setConfig).catch(console.error);
    listInstalledPlugins()
      .then(setPlugins)
      .catch((error) => {
        console.warn("[DevLauncher] listInstalledPlugins failed:", error);
        setPlugins([]);
      });
    setRecent(loadRecentActions());

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SearchPrefillPayload>).detail;
      setInitialQuery(detail?.text ?? "");
    };

    window.addEventListener(SEARCH_PREFILL_EVENT, handler);
    return () => window.removeEventListener(SEARCH_PREFILL_EVENT, handler);
  }, []);

  const pluginRecords = useMemo(() => buildPluginActionRecords(plugins), [plugins]);
  const records = useMemo(() => mergeActionRecords([
    ...recent,
    ...buildKeyboardActionRecords(config),
    ...buildBuiltinActionRecords(BUILTIN_REGISTRY.map((item) => item.manifest)),
    ...pluginRecords,
  ]), [config, pluginRecords, recent]);
  const quickActions = useMemo(() => mergeActionRecords([
    ...buildBuiltinActionRecords(BUILTIN_REGISTRY.map((item) => item.manifest)),
    ...buildKeyboardActionRecords(config),
    ...pluginRecords,
  ]).slice(0, 18), [config, pluginRecords]);

  async function execute(record: LauncherActionRecord) {
    await executeLauncherAction(record, {
      invoke,
    });
    recordRecentAction(record);
    setRecent(loadRecentActions());
    getCurrentWindow().hide().catch(() => {});
  }

  return (
    <SearchPanel
      key={initialQuery}
      records={records}
      quickActions={quickActions}
      initialQuery={initialQuery}
      onExecute={(record) => {
        execute(record).catch(console.error);
      }}
      onClose={() => getCurrentWindow().hide().catch(() => {})}
    />
  );
}
