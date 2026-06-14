import type { LauncherActionRecord } from "./actionIndex";

const STORAGE_KEY = "devlauncher.recentActions";
const MAX_RECENT = 20;

function serializableRecord(record: LauncherActionRecord): LauncherActionRecord {
  return {
    id: record.id,
    title: record.title,
    subtitle: record.subtitle,
    source: record.source,
    actionKind: record.actionKind,
    action: record.action,
    builtinFeature: record.builtinFeature,
    keywords: record.keywords,
    pageName: record.pageName,
    keyId: record.keyId,
    lastUsedAt: record.lastUsedAt,
  };
}

function isLauncherActionRecord(item: unknown): item is LauncherActionRecord {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as LauncherActionRecord).id === "string" &&
    typeof (item as LauncherActionRecord).title === "string" &&
    Array.isArray((item as LauncherActionRecord).keywords)
  );
}

export function loadRecentActions(): LauncherActionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isLauncherActionRecord).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecentActions(records: LauncherActionRecord[]): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(records.slice(0, MAX_RECENT).map(serializableRecord)),
  );
}

export function recordRecentAction(record: LauncherActionRecord): void {
  const stamped = serializableRecord({ ...record, lastUsedAt: Date.now() });
  const next = [
    stamped,
    ...loadRecentActions().filter((item) => item.id !== stamped.id),
  ].slice(0, MAX_RECENT);

  saveRecentActions(next);
}
