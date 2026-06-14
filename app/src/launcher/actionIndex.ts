import type { BuiltinManifest } from "@/builtins/types";
import type { Action, BuiltinFeature, KeyboardConfig, KeyId } from "@/types/actions";

export type LauncherActionSource = "keyboard" | "builtin" | "recent" | "ocr";
export type LauncherActionKind = "execute-action" | "toggle-builtin" | "frontend-command";
export type FrontendCommand = "copy-ocr-text" | "search-ocr-text" | "send-ocr-to-report";

export interface LauncherActionRecord {
  id: string;
  title: string;
  subtitle?: string;
  source: LauncherActionSource;
  actionKind: LauncherActionKind;
  action?: Action;
  builtinFeature?: BuiltinFeature;
  frontendCommand?: FrontendCommand;
  keywords: string[];
  pageName?: string;
  keyId?: KeyId;
  payload?: Record<string, unknown>;
  lastUsedAt?: number;
}

export interface LauncherSearchResult {
  record: LauncherActionRecord;
  score: number;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: Array<string | number | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => normalize(String(value ?? ""))).filter(Boolean)));
}

function actionKeywords(action: Action): string[] {
  const base: Array<string | number | undefined> = [action.type, action.name];

  if (
    action.type === "app" ||
    action.type === "folder" ||
    action.type === "file" ||
    action.type === "url"
  ) {
    base.push(action.target);
  }

  if (action.type === "ssh") {
    base.push(action.host, action.user, action.port, action.identity, action.terminal);
  }

  if (action.type === "script") {
    base.push(action.shell, action.content, action.file);
  }

  if (action.type === "system") {
    base.push(action.command);
  }

  if (action.type === "builtin") {
    base.push(action.feature);
  }

  return unique(base);
}

export function buildKeyboardActionRecords(config: KeyboardConfig | null): LauncherActionRecord[] {
  if (!config) return [];

  return config.pages.flatMap((page, pageIndex) => (
    Object.entries(page.keys).flatMap(([keyId, binding]) => {
      const action = binding?.action;
      if (!action) return [];

      return [{
        id: `keyboard:${pageIndex}:${keyId}`,
        title: action.name,
        subtitle: `${page.name} / ${keyId}`,
        source: "keyboard" as const,
        actionKind: action.type === "builtin" ? "toggle-builtin" as const : "execute-action" as const,
        action,
        builtinFeature: action.type === "builtin" ? action.feature : undefined,
        keywords: unique([page.name, keyId, ...actionKeywords(action)]),
        pageName: page.name,
        keyId: keyId as KeyId,
      }];
    })
  ));
}

export function buildBuiltinActionRecords(manifests: BuiltinManifest[]): LauncherActionRecord[] {
  return manifests.map((manifest) => ({
    id: `builtin:${manifest.id}`,
    title: manifest.name,
    subtitle: manifest.description,
    source: "builtin",
    actionKind: "toggle-builtin",
    builtinFeature: manifest.id as BuiltinFeature,
    keywords: unique([manifest.id, manifest.name, manifest.description]),
  }));
}

export function buildOcrActionRecords(text: string): LauncherActionRecord[] {
  const value = text.trim();
  if (!value) return [];

  return [
    {
      id: "ocr:copy",
      title: "Copy OCR text",
      subtitle: value,
      source: "ocr",
      actionKind: "frontend-command",
      frontendCommand: "copy-ocr-text",
      payload: { text: value },
      keywords: unique(["ocr", "copy", value]),
    },
    {
      id: "ocr:search",
      title: "Search OCR text",
      subtitle: value,
      source: "ocr",
      actionKind: "frontend-command",
      frontendCommand: "search-ocr-text",
      payload: { text: value },
      keywords: unique(["ocr", "search", value]),
    },
    {
      id: "ocr:report",
      title: "Send OCR text to screenshot report",
      subtitle: value,
      source: "ocr",
      actionKind: "frontend-command",
      frontendCommand: "send-ocr-to-report",
      payload: { text: value },
      keywords: unique(["ocr", "report", "screenshot", value]),
    },
  ];
}

function scoreRecord(record: LauncherActionRecord, query: string): number {
  const q = normalize(query);

  if (!q) {
    const recentScore = record.lastUsedAt ? 200 : 0;
    const builtinScore = record.source === "builtin" ? 100 : 0;
    return recentScore + builtinScore;
  }

  const title = normalize(record.title);
  const haystack = unique([record.title, record.subtitle ?? "", ...record.keywords]);

  if (title === q) return 1000;
  if (title.startsWith(q)) return 850;
  if (haystack.some((item) => item === q)) return 760;
  if (haystack.some((item) => item.startsWith(q))) return 620;
  if (haystack.some((item) => item.includes(q))) return 420;

  const chars = q.split("");
  const fuzzy = haystack.some((item) => {
    let pos = 0;

    for (const char of item) {
      if (char === chars[pos]) pos += 1;
      if (pos === chars.length) return true;
    }

    return false;
  });

  return fuzzy ? 180 : 0;
}

export function searchActionRecords(
  records: LauncherActionRecord[],
  query: string,
  limit = 12,
): LauncherSearchResult[] {
  return records
    .map((record) => ({
      record,
      score: scoreRecord(record, query) + (record.lastUsedAt ? 30 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
    .slice(0, limit);
}
