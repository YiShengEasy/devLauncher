# Entry OCR Search Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a searchable DevLauncher entry first, connect instant region OCR as an action source second, then expose both through a low-distraction desktop pet entry.

**Architecture:** Keep the existing virtual keyboard and `keyboard.yaml` model intact. Add an `Action Index` that normalizes keyboard bindings, builtins, recent actions, and OCR result actions; add an `Entry Controller` layer through Tauri window commands so keyboard, search, OCR, and pet entries call the same action execution path.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Zustand, Vite, Vitest for focused frontend unit tests, existing `screenshots` Rust crate for screen capture, OCR engine selected by a spike task before final OCR wiring.

---

## Scope

This plan implements the design in `docs/superpowers/specs/2026-06-14-entry-ocr-search-pet-design.md` in three usable milestones:

1. Search entry MVP: action index, search UI, recent actions, shortcut, and Tauri window.
2. OCR MVP: screen region selection, OCR text result, copy/search/report distribution.
3. Desktop pet MVP: disabled by default, opens search/OCR and shows lightweight state.

The plan does not rename `KeyboardConfig`, migrate existing configs, replace the keyboard launcher, build a full AI desktop pet, build cloud sync, or add a plugin marketplace.

## File Structure

Create these frontend files:

- `app/src/launcher/actionIndex.ts`: Pure action indexing, search scoring, OCR result action creation.
- `app/src/launcher/actionIndex.test.ts`: Unit tests for action indexing and search ranking.
- `app/src/launcher/actionExecutor.ts`: Single frontend executor for indexed actions.
- `app/src/launcher/actionExecutor.test.ts`: Unit tests for invoke/copy/search dispatch.
- `app/src/launcher/recentActions.ts`: LocalStorage recent action persistence.
- `app/src/launcher/recentActions.test.ts`: Unit tests for recent action ordering and limits.
- `app/src/entry/SearchEntryApp.tsx`: Search window app.
- `app/src/entry/SearchPanel.tsx`: Search input and results UI.
- `app/src/entry/OcrEntryApp.tsx`: OCR region-selection and result-distribution window.
- `app/src/entry/PetEntryApp.tsx`: Desktop pet lightweight entry window.
- `app/src/entry/entryEvents.ts`: Shared Tauri/browser event names and payload types.

Modify these frontend files:

- `app/src/main.tsx`: Route `?entry=search`, `?entry=ocr`, and `?entry=pet` before builtin `?view=<id>`.
- `app/src/App.tsx`: Register search and OCR global shortcuts without changing existing keyboard shortcuts.
- `app/src/types/actions.ts`: Export reusable builtin toggle mapping helpers if needed.
- `app/src/components/SettingsPanel.tsx`: Add entry settings in the last milestone only.
- `app/package.json`: Add `test` script and Vitest dependencies.

Create these Rust files:

- `app/src-tauri/src/entries.rs`: Tauri commands for `toggle_search_window`, `show_search_window`, `toggle_ocr_window`, `toggle_pet_window`, and event payload routing.
- `app/src-tauri/src/ocr.rs`: OCR commands and screen capture helpers for the OCR window.

Modify these Rust/config files:

- `app/src-tauri/src/lib.rs`: Register new modules and invoke handlers.
- `app/src-tauri/tauri.conf.json`: Add `search`, `ocr`, and `pet` windows.
- `app/src-tauri/capabilities/default.json`: Add new windows and permissions required by their frontend APIs.
- `app/src-tauri/Cargo.toml`: Add OCR engine dependency only after the OCR spike selects a route.

## Milestone 1: Search Entry MVP

### Task 1: Add Test Harness

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Add Vitest scripts and dev dependencies**

Update `app/package.json` scripts and dev dependencies to include:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Keep all existing dependencies and dev dependencies.

- [ ] **Step 2: Install dependencies**

Run:

```powershell
cd app
npm install
```

Expected: `package-lock.json` updates and `npm` exits with code 0. If network access is blocked, rerun the command with sandbox escalation.

- [ ] **Step 3: Verify empty test command behavior**

Run:

```powershell
cd app
npm run test -- --passWithNoTests
```

Expected: Vitest exits successfully with no test files found or no tests run.

- [ ] **Step 4: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/package.json app/package-lock.json
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "test: add frontend test harness"
```

### Task 2: Build Action Index

**Files:**
- Create: `app/src/launcher/actionIndex.ts`
- Create: `app/src/launcher/actionIndex.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/src/launcher/actionIndex.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BuiltinManifest } from "@/builtins/types";
import type { KeyboardConfig } from "@/types/actions";
import {
  buildBuiltinActionRecords,
  buildKeyboardActionRecords,
  buildOcrActionRecords,
  searchActionRecords,
} from "./actionIndex";

const config: KeyboardConfig = {
  pages: [
    {
      name: "Dev",
      keys: {
        Q: { action: { type: "app", name: "VS Code", target: "C:/Code/Code.exe" } },
        W: { action: { type: "url", name: "GitHub", target: "https://github.com" } },
      },
    },
    {
      name: "Ops",
      keys: {
        A: { action: { type: "builtin", name: "Clipboard", feature: "clipboard" } },
      },
    },
  ],
};

const manifests: BuiltinManifest[] = [
  {
    id: "terminal",
    name: "Terminal",
    description: "Built-in terminal",
    emoji: ">",
    window: { width: 860, height: 520 },
  },
];

describe("actionIndex", () => {
  it("builds searchable records from keyboard bindings", () => {
    const records = buildKeyboardActionRecords(config);

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      id: "keyboard:0:Q",
      title: "VS Code",
      subtitle: "Dev / Q",
      source: "keyboard",
      actionKind: "execute-action",
      pageName: "Dev",
      keyId: "Q",
    });
  });

  it("builds builtin records from manifests", () => {
    const records = buildBuiltinActionRecords(manifests);

    expect(records).toEqual([
      expect.objectContaining({
        id: "builtin:terminal",
        title: "Terminal",
        source: "builtin",
        actionKind: "toggle-builtin",
      }),
    ]);
  });

  it("ranks exact and prefix matches before fuzzy matches", () => {
    const records = [
      ...buildKeyboardActionRecords(config),
      ...buildBuiltinActionRecords(manifests),
    ];

    const results = searchActionRecords(records, "git");

    expect(results[0].record.title).toBe("GitHub");
    expect(results[0].score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("returns recent/builtin defaults for an empty query", () => {
    const records = searchActionRecords([
      { ...buildKeyboardActionRecords(config)[0], lastUsedAt: 10 },
      ...buildBuiltinActionRecords(manifests),
    ], "");

    expect(records.map((item) => item.record.id)).toEqual([
      "keyboard:0:Q",
      "builtin:terminal",
    ]);
  });

  it("builds OCR result actions for non-empty text", () => {
    const records = buildOcrActionRecords("npm run build failed");

    expect(records.map((record) => record.id)).toEqual([
      "ocr:copy",
      "ocr:search",
      "ocr:report",
    ]);
    expect(records[0].title).toBe("Copy OCR text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd app
npm run test -- src/launcher/actionIndex.test.ts
```

Expected: FAIL because `app/src/launcher/actionIndex.ts` does not exist.

- [ ] **Step 3: Implement Action Index**

Create `app/src/launcher/actionIndex.ts`:

```ts
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(normalize).filter(Boolean)));
}

function actionKeywords(action: Action): string[] {
  const base = [action.type, action.name];
  if (action.type === "app" || action.type === "folder" || action.type === "file" || action.type === "url") {
    base.push(action.target);
  }
  if (action.type === "ssh") {
    base.push(action.host, action.user);
  }
  if (action.type === "script") {
    base.push(action.shell, action.content);
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
    .map((record) => ({ record, score: scoreRecord(record, query) + (record.lastUsedAt ? 30 : 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
cd app
npm run test -- src/launcher/actionIndex.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/launcher/actionIndex.ts app/src/launcher/actionIndex.test.ts
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: add launcher action index"
```

### Task 3: Add Recent Action Persistence

**Files:**
- Create: `app/src/launcher/recentActions.ts`
- Create: `app/src/launcher/recentActions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/src/launcher/recentActions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LauncherActionRecord } from "./actionIndex";
import { loadRecentActions, recordRecentAction } from "./recentActions";

const base: LauncherActionRecord = {
  id: "keyboard:0:Q",
  title: "VS Code",
  source: "keyboard",
  actionKind: "execute-action",
  action: { type: "app", name: "VS Code", target: "C:/Code/Code.exe" },
  keywords: ["vs code"],
};

describe("recentActions", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.setSystemTime(new Date("2026-06-14T00:00:00Z"));
  });

  it("stores the newest action first", () => {
    recordRecentAction(base);
    recordRecentAction({ ...base, id: "builtin:terminal", title: "Terminal", source: "builtin", actionKind: "toggle-builtin", builtinFeature: "terminal" });

    expect(loadRecentActions().map((item) => item.id)).toEqual([
      "builtin:terminal",
      "keyboard:0:Q",
    ]);
  });

  it("deduplicates records by id", () => {
    recordRecentAction(base);
    recordRecentAction({ ...base, title: "VS Code Updated" });

    expect(loadRecentActions()).toHaveLength(1);
    expect(loadRecentActions()[0].title).toBe("VS Code Updated");
  });

  it("keeps at most 20 records", () => {
    for (let i = 0; i < 24; i += 1) {
      recordRecentAction({ ...base, id: `keyboard:0:${i}`, title: `Action ${i}` });
    }

    expect(loadRecentActions()).toHaveLength(20);
    expect(loadRecentActions()[0].title).toBe("Action 23");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd app
npm run test -- src/launcher/recentActions.test.ts
```

Expected: FAIL because `recentActions.ts` does not exist.

- [ ] **Step 3: Implement recent actions**

Create `app/src/launcher/recentActions.ts`:

```ts
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
    frontendCommand: record.frontendCommand,
    keywords: record.keywords,
    pageName: record.pageName,
    keyId: record.keyId,
    payload: record.payload,
    lastUsedAt: record.lastUsedAt,
  };
}

export function loadRecentActions(): LauncherActionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LauncherActionRecord => (
      typeof item?.id === "string" &&
      typeof item?.title === "string" &&
      Array.isArray(item?.keywords)
    ));
  } catch {
    return [];
  }
}

export function saveRecentActions(records: LauncherActionRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECENT).map(serializableRecord)));
}

export function recordRecentAction(record: LauncherActionRecord) {
  const stamped = serializableRecord({ ...record, lastUsedAt: Date.now() });
  const next = [
    stamped,
    ...loadRecentActions().filter((item) => item.id !== stamped.id),
  ].slice(0, MAX_RECENT);
  saveRecentActions(next);
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
cd app
npm run test -- src/launcher/recentActions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/launcher/recentActions.ts app/src/launcher/recentActions.test.ts
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: persist launcher recent actions"
```

### Task 4: Add Single Action Executor

**Files:**
- Create: `app/src/launcher/actionExecutor.ts`
- Create: `app/src/launcher/actionExecutor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/src/launcher/actionExecutor.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { LauncherActionRecord } from "./actionIndex";
import { executeLauncherAction } from "./actionExecutor";

describe("actionExecutor", () => {
  it("executes normal actions through execute_action", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const record: LauncherActionRecord = {
      id: "keyboard:0:Q",
      title: "VS Code",
      source: "keyboard",
      actionKind: "execute-action",
      action: { type: "app", name: "VS Code", target: "C:/Code/Code.exe" },
      keywords: ["vs code"],
    };

    await executeLauncherAction(record, { invoke });

    expect(invoke).toHaveBeenCalledWith("execute_action", { action: record.action });
  });

  it("executes builtin records through the matching toggle command", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const record: LauncherActionRecord = {
      id: "builtin:json",
      title: "JSON",
      source: "builtin",
      actionKind: "toggle-builtin",
      builtinFeature: "json",
      keywords: ["json"],
    };

    await executeLauncherAction(record, { invoke });

    expect(invoke).toHaveBeenCalledWith("toggle_json_helper_window");
  });

  it("copies OCR text through the clipboard dependency", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const record: LauncherActionRecord = {
      id: "ocr:copy",
      title: "Copy OCR text",
      source: "ocr",
      actionKind: "frontend-command",
      frontendCommand: "copy-ocr-text",
      payload: { text: "error text" },
      keywords: ["ocr"],
    };

    await executeLauncherAction(record, { invoke: vi.fn(), writeText });

    expect(writeText).toHaveBeenCalledWith("error text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd app
npm run test -- src/launcher/actionExecutor.test.ts
```

Expected: FAIL because `actionExecutor.ts` does not exist.

- [ ] **Step 3: Implement executor**

Create `app/src/launcher/actionExecutor.ts`:

```ts
import type { BuiltinFeature } from "@/types/actions";
import type { LauncherActionRecord } from "./actionIndex";

export interface ActionExecutorDeps {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  writeText?: (text: string) => Promise<void>;
  openSearchWithText?: (text: string) => Promise<void>;
}

export function builtinToggleCommand(feature: BuiltinFeature): string {
  return feature === "json" ? "toggle_json_helper_window" : `toggle_${feature}_window`;
}

function textPayload(record: LauncherActionRecord): string {
  const text = record.payload?.text;
  return typeof text === "string" ? text : "";
}

export async function executeLauncherAction(record: LauncherActionRecord, deps: ActionExecutorDeps): Promise<void> {
  if (record.actionKind === "execute-action") {
    if (!record.action) throw new Error(`Missing action for ${record.id}`);
    await deps.invoke("execute_action", { action: record.action });
    return;
  }

  if (record.actionKind === "toggle-builtin") {
    if (!record.builtinFeature) throw new Error(`Missing builtin feature for ${record.id}`);
    await deps.invoke(builtinToggleCommand(record.builtinFeature));
    return;
  }

  if (record.frontendCommand === "copy-ocr-text") {
    const writeText = deps.writeText ?? navigator.clipboard.writeText.bind(navigator.clipboard);
    await writeText(textPayload(record));
    return;
  }

  if (record.frontendCommand === "search-ocr-text") {
    if (!deps.openSearchWithText) throw new Error("Search entry dependency is not available");
    await deps.openSearchWithText(textPayload(record));
    return;
  }

  if (record.frontendCommand === "send-ocr-to-report") {
    await deps.invoke("show_screenshotai_window");
    window.dispatchEvent(new CustomEvent("devlauncher-ocr-report-text", { detail: { text: textPayload(record) } }));
    return;
  }

  throw new Error(`Unsupported launcher action ${record.id}`);
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
cd app
npm run test -- src/launcher/actionExecutor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/launcher/actionExecutor.ts app/src/launcher/actionExecutor.test.ts
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: add launcher action executor"
```

### Task 5: Create Search Entry UI

**Files:**
- Create: `app/src/entry/SearchPanel.tsx`
- Create: `app/src/entry/SearchEntryApp.tsx`
- Create: `app/src/entry/entryEvents.ts`
- Modify: `app/src/main.tsx`

- [ ] **Step 1: Create event contract**

Create `app/src/entry/entryEvents.ts`:

```ts
export const SEARCH_PREFILL_EVENT = "devlauncher-search-prefill";
export const OCR_REPORT_TEXT_EVENT = "devlauncher-ocr-report-text";

export interface SearchPrefillPayload {
  text: string;
}

export interface OcrReportTextPayload {
  text: string;
}
```

- [ ] **Step 2: Create SearchPanel**

Create `app/src/entry/SearchPanel.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { LauncherActionRecord } from "@/launcher/actionIndex";
import { searchActionRecords } from "@/launcher/actionIndex";

const shellStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  padding: 12,
  background: "rgba(12,14,24,0.92)",
  color: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  overflow: "hidden",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  height: 44,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.92)",
  outline: "none",
  padding: "0 12px",
  fontSize: 16,
};

export function SearchPanel({
  records,
  initialQuery = "",
  onExecute,
  onClose,
}: {
  records: LauncherActionRecord[];
  initialQuery?: string;
  onExecute: (record: LauncherActionRecord) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const results = useMemo(() => searchActionRecords(records, query), [records, query]);

  const selected = results[selectedIndex]?.record;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter" && selected) {
      event.preventDefault();
      onExecute(selected);
    }
  }

  return (
    <div style={shellStyle}>
      <input
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        aria-label="Search actions, tools, OCR text"
        style={inputStyle}
      />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {results.map(({ record }, index) => (
          <button
            key={record.id}
            onClick={() => onExecute(record)}
            style={{
              minHeight: 48,
              textAlign: "left",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              background: index === selectedIndex ? "rgba(59,130,246,0.28)" : "rgba(255,255,255,0.045)",
              color: "rgba(255,255,255,0.9)",
              cursor: "pointer",
              padding: "7px 10px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>{record.title}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
              {record.subtitle ?? record.source}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create SearchEntryApp**

Create `app/src/entry/SearchEntryApp.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BUILTIN_REGISTRY } from "@/builtins/_registry";
import { loadConfig } from "@/api/config";
import type { KeyboardConfig } from "@/types/actions";
import { buildBuiltinActionRecords, buildKeyboardActionRecords, type LauncherActionRecord } from "@/launcher/actionIndex";
import { executeLauncherAction } from "@/launcher/actionExecutor";
import { loadRecentActions, recordRecentAction } from "@/launcher/recentActions";
import { SearchPanel } from "./SearchPanel";
import { SEARCH_PREFILL_EVENT, type SearchPrefillPayload } from "./entryEvents";

export function SearchEntryApp() {
  const [config, setConfig] = useState<KeyboardConfig | null>(null);
  const [recent, setRecent] = useState<LauncherActionRecord[]>([]);
  const [initialQuery, setInitialQuery] = useState("");

  useEffect(() => {
    loadConfig().then(setConfig).catch(console.error);
    setRecent(loadRecentActions());
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SearchPrefillPayload>).detail;
      setInitialQuery(detail?.text ?? "");
    };
    window.addEventListener(SEARCH_PREFILL_EVENT, handler);
    return () => window.removeEventListener(SEARCH_PREFILL_EVENT, handler);
  }, []);

  const records = useMemo(() => [
    ...recent,
    ...buildKeyboardActionRecords(config),
    ...buildBuiltinActionRecords(BUILTIN_REGISTRY.map((item) => item.manifest)),
  ], [config, recent]);

  async function execute(record: LauncherActionRecord) {
    await executeLauncherAction(record, {
      invoke,
      openSearchWithText: async (text) => {
        window.dispatchEvent(new CustomEvent(SEARCH_PREFILL_EVENT, { detail: { text } }));
      },
    });
    recordRecentAction(record);
    setRecent(loadRecentActions());
    getCurrentWindow().hide().catch(() => {});
  }

  return (
    <SearchPanel
      key={initialQuery}
      records={records}
      initialQuery={initialQuery}
      onExecute={(record) => { execute(record).catch(console.error); }}
      onClose={() => getCurrentWindow().hide().catch(() => {})}
    />
  );
}
```

- [ ] **Step 4: Route entry apps in main.tsx**

Modify `app/src/main.tsx` to this structure:

```tsx
import ReactDOM from "react-dom/client";
import { Suspense } from "react";
import App from "./App";
import { BUILTIN_REGISTRY } from "./builtins/_registry";
import { SearchEntryApp } from "./entry/SearchEntryApp";
import { OcrEntryApp } from "./entry/OcrEntryApp";
import { PetEntryApp } from "./entry/PetEntryApp";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const entry = params.get("entry");
const view = params.get("view");
const plugin = view ? BUILTIN_REGISTRY.find(p => p.manifest.id === view) : null;

function RoutedApp() {
  if (entry === "search") return <SearchEntryApp />;
  if (entry === "ocr") return <OcrEntryApp />;
  if (entry === "pet") return <PetEntryApp />;
  if (plugin) {
    return (
      <Suspense fallback={null}>
        <plugin.App />
      </Suspense>
    );
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<RoutedApp />);
```

If `OcrEntryApp` and `PetEntryApp` are not created yet, add temporary components in their target files in the same task:

```tsx
export function OcrEntryApp() {
  return <div />;
}
```

```tsx
export function PetEntryApp() {
  return <div />;
}
```

- [ ] **Step 5: Run frontend checks**

Run:

```powershell
cd app
npm run test -- src/launcher/actionIndex.test.ts src/launcher/actionExecutor.test.ts src/launcher/recentActions.test.ts
npm run build
```

Expected: tests PASS and build exits successfully.

- [ ] **Step 6: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/entry app/src/main.tsx
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: add search entry UI"
```

### Task 6: Add Search Tauri Window and Shortcut

**Files:**
- Create: `app/src-tauri/src/entries.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/tauri.conf.json`
- Modify: `app/src-tauri/capabilities/default.json`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Add entry window commands**

Create `app/src-tauri/src/entries.rs`:

```rust
use tauri::Manager;

fn show_window(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {}", label))?;
    win.show().map_err(|e| e.to_string())?;
    win.unminimize().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_search_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("search") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    show_window(&app, "search")
}

#[tauri::command]
pub fn show_search_window(app: tauri::AppHandle) -> Result<(), String> {
    show_window(&app, "search")
}

#[tauri::command]
pub fn toggle_ocr_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("ocr") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    show_window(&app, "ocr")
}

#[tauri::command]
pub fn toggle_pet_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("pet") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    show_window(&app, "pet")
}
```

- [ ] **Step 2: Register commands in lib.rs**

Modify `app/src-tauri/src/lib.rs`:

```rust
mod actions;
mod builtins;
mod config;
mod entries;
mod types;
mod utils;
```

Add to `tauri::generate_handler![...]`:

```rust
entries::toggle_search_window,
entries::show_search_window,
entries::toggle_ocr_window,
entries::toggle_pet_window,
```

- [ ] **Step 3: Add windows to tauri.conf.json**

Add these windows to `app.src-tauri/tauri.conf.json` under `app.windows`:

```json
{
  "label": "search",
  "url": "index.html?entry=search",
  "title": "DevLauncher Search",
  "width": 640,
  "height": 520,
  "resizable": false,
  "decorations": false,
  "transparent": true,
  "shadow": false,
  "alwaysOnTop": true,
  "center": true,
  "skipTaskbar": true,
  "visible": false
},
{
  "label": "ocr",
  "url": "index.html?entry=ocr",
  "title": "DevLauncher OCR",
  "width": 1280,
  "height": 800,
  "resizable": false,
  "decorations": false,
  "transparent": true,
  "shadow": false,
  "alwaysOnTop": true,
  "center": true,
  "skipTaskbar": true,
  "visible": false
},
{
  "label": "pet",
  "url": "index.html?entry=pet",
  "title": "DevLauncher Pet",
  "width": 86,
  "height": 86,
  "resizable": false,
  "decorations": false,
  "transparent": true,
  "shadow": false,
  "alwaysOnTop": true,
  "center": false,
  "skipTaskbar": true,
  "visible": false
}
```

- [ ] **Step 4: Add windows to capabilities**

Modify `app/src-tauri/capabilities/default.json` windows array:

```json
"windows": ["main", "clipboard", "json-helper", "totp", "remotedesk", "terminal", "screenshotai", "screenshot", "webaccounts", "quickmemory", "search", "ocr", "pet"]
```

- [ ] **Step 5: Register search and OCR shortcuts in App.tsx**

In `app/src/App.tsx`, after the existing `Ctrl+Shift+V` shortcut registration block, add:

```ts
      if (!cancelled) {
        try {
          await registerShortcut(
            "Ctrl+Space",
            makeDebounced(async () => {
              invoke("toggle_search_window").catch(console.error);
            })
          );
        } catch (err) {
          console.warn("Ctrl+Space search shortcut unavailable:", err);
        }
      }

      if (!cancelled) {
        try {
          await registerShortcut(
            "Ctrl+Shift+O",
            makeDebounced(async () => {
              invoke("toggle_ocr_window").catch(console.error);
            })
          );
        } catch (err) {
          console.warn("Ctrl+Shift+O OCR shortcut unavailable:", err);
        }
      }
```

- [ ] **Step 6: Run checks**

Run:

```powershell
cd app
npm run build
cd src-tauri
cargo fmt
cargo check
```

Expected: frontend build passes, Rust formatting completes, Rust check passes.

- [ ] **Step 7: Manual search verification**

Run:

```powershell
cd app
npm run tauri dev
```

Expected:

- `Alt+Space` still toggles the keyboard window.
- `Ctrl+Space` toggles the search window.
- Searching for a builtin such as `terminal` shows a result.
- Pressing Enter on `terminal` opens the terminal built-in window.

- [ ] **Step 8: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src-tauri/src/entries.rs app/src-tauri/src/lib.rs app/src-tauri/tauri.conf.json app/src-tauri/capabilities/default.json app/src/App.tsx
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: wire search entry window"
```

## Milestone 2: OCR MVP

### Task 7: Run OCR Engine Spike

**Files:**
- Create: `app/src-tauri/src/ocr.rs`
- Modify: `app/src-tauri/Cargo.toml`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Test Windows OCR API feasibility**

Create `app/src-tauri/src/ocr.rs` with this temporary command:

```rust
#[tauri::command]
pub fn ocr_engine_status() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        Ok("windows-ocr-candidate".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok("unsupported-platform".to_string())
    }
}
```

Register `mod ocr;` and `ocr::ocr_engine_status` in `app/src-tauri/src/lib.rs`.

- [ ] **Step 2: Run Rust check**

Run:

```powershell
cd app/src-tauri
cargo fmt
cargo check
```

Expected: PASS. This proves the module boundary is valid before adding OCR-specific dependencies.

- [ ] **Step 3: Choose engine for implementation**

Decision rule:

- Use Windows OCR API if a Rust spike can compile and return recognized text from a PNG in under one work session.
- Use Tesseract if Windows OCR API cannot be compiled cleanly from Rust.
- Do not use external AI OCR for MVP because the design requires local default behavior and privacy clarity.

Record the chosen route at the top of `app/src-tauri/src/ocr.rs` as a comment:

```rust
// OCR MVP engine: Windows OCR API on Windows. Tesseract fallback is reserved for a separate implementation pass.
```

If the chosen route is Tesseract, use:

```rust
// OCR MVP engine: Tesseract local OCR. Windows OCR API spike did not produce a maintainable Rust integration.
```

- [ ] **Step 4: Commit module boundary**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src-tauri/src/ocr.rs app/src-tauri/src/lib.rs app/src-tauri/Cargo.toml
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: add OCR module boundary"
```

### Task 8: Add OCR Window UI Plumbing

**Files:**
- Create or replace: `app/src/entry/OcrEntryApp.tsx`
- Modify: `app/src/entry/SearchEntryApp.tsx`

- [ ] **Step 1: Implement OCR entry shell**

Replace `app/src/entry/OcrEntryApp.tsx` with:

```tsx
import { useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { buildOcrActionRecords, type LauncherActionRecord } from "@/launcher/actionIndex";
import { executeLauncherAction } from "@/launcher/actionExecutor";
import { SEARCH_PREFILL_EVENT } from "./entryEvents";

const shell: CSSProperties = {
  width: "100vw",
  height: "100vh",
  background: "rgba(6,8,14,0.72)",
  color: "rgba(255,255,255,0.9)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export function OcrEntryApp() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Ready");

  async function runOcr() {
    setStatus("Recognizing selected area");
    const result = await invoke<string>("ocr_recognize_selection").catch((error) => {
      setStatus(String(error));
      return "";
    });
    setText(result);
    if (result) setStatus("OCR complete");
  }

  async function execute(record: LauncherActionRecord) {
    await executeLauncherAction(record, {
      invoke,
      openSearchWithText: async (value) => {
        await invoke("show_search_window");
        window.dispatchEvent(new CustomEvent(SEARCH_PREFILL_EVENT, { detail: { text: value } }));
      },
    });
  }

  const actions = buildOcrActionRecords(text);

  return (
    <div style={shell}>
      <div style={{ width: 520, padding: 16, borderRadius: 14, background: "rgba(20,22,34,0.96)", border: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>OCR</strong>
          <button onClick={() => getCurrentWindow().hide()} style={{ width: 28, height: 28 }}>x</button>
        </div>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{status}</p>
        <button onClick={() => runOcr().catch(console.error)} style={{ width: "100%", height: 36 }}>
          Select area and recognize
        </button>
        <textarea readOnly value={text} style={{ width: "100%", minHeight: 140, marginTop: 12, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {actions.map((action) => (
            <button key={action.id} onClick={() => execute(action).catch(console.error)}>
              {action.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd app
npm run build
```

Expected: PASS. OCR command may not exist yet at runtime, but TypeScript should compile.

- [ ] **Step 3: Commit UI plumbing**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/entry/OcrEntryApp.tsx
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: add OCR entry shell"
```

### Task 9: Implement OCR Recognition Command

**Files:**
- Modify: `app/src-tauri/src/ocr.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/Cargo.toml`

- [ ] **Step 1: Replace OCR status with selection command**

Implement this public command shape in `app/src-tauri/src/ocr.rs`:

```rust
#[tauri::command]
pub fn ocr_recognize_selection() -> Result<String, String> {
    recognize_current_selection()
}

fn recognize_current_selection() -> Result<String, String> {
    recognize_with_selected_engine()
}
```

Keep `recognize_with_selected_engine` private and engine-specific. It must return a plain text string with whitespace normalized.

- [ ] **Step 2: Windows OCR route implementation rule**

If Windows OCR API was selected in Task 7, implement `recognize_with_selected_engine` so it:

1. Captures the primary screen or current selected region.
2. Converts the image into the format required by Windows OCR.
3. Calls the Windows OCR API.
4. Joins recognized lines with `\n`.
5. Returns `Err("No text recognized")` when the OCR result is empty.

The final function shape must be:

```rust
fn recognize_with_selected_engine() -> Result<String, String> {
    let text = recognize_windows_ocr()?;
    let normalized = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if normalized.is_empty() {
        Err("No text recognized".to_string())
    } else {
        Ok(normalized)
    }
}
```

- [ ] **Step 3: Tesseract route implementation rule**

If Tesseract was selected in Task 7, implement `recognize_with_selected_engine` so it:

1. Captures the primary screen or current selected region.
2. Writes a temporary PNG to the app cache directory.
3. Runs local Tesseract against the PNG.
4. Returns stdout text with whitespace normalized.
5. Returns `Err("No text recognized")` when stdout is empty.

The final function shape must be:

```rust
fn recognize_with_selected_engine() -> Result<String, String> {
    let text = recognize_tesseract()?;
    let normalized = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if normalized.is_empty() {
        Err("No text recognized".to_string())
    } else {
        Ok(normalized)
    }
}
```

- [ ] **Step 4: Register final command**

In `app/src-tauri/src/lib.rs`, replace `ocr::ocr_engine_status` with:

```rust
ocr::ocr_recognize_selection,
```

- [ ] **Step 5: Run checks**

Run:

```powershell
cd app/src-tauri
cargo fmt
cargo check
```

Expected: PASS.

- [ ] **Step 6: Manual OCR verification**

Run:

```powershell
cd app
npm run tauri dev
```

Expected:

- `Ctrl+Shift+O` opens OCR window.
- Clicking `Select area and recognize` returns text for a visible text region.
- `Copy OCR text` copies recognized text.
- `Search OCR text` opens or focuses search.
- `Send OCR text to screenshot report` opens screenshot report.

- [ ] **Step 7: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src-tauri/src/ocr.rs app/src-tauri/src/lib.rs app/src-tauri/Cargo.toml
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: add OCR recognition command"
```

### Task 10: Attach OCR Text to Screenshot Report Draft

**Files:**
- Modify: `app/src/builtins/screenshotai/App.tsx`
- Modify: `app/src/entry/entryEvents.ts`

- [ ] **Step 1: Add report text event listener**

In `app/src/builtins/screenshotai/App.tsx`, import the event name:

```ts
import { OCR_REPORT_TEXT_EVENT, type OcrReportTextPayload } from "@/entry/entryEvents";
```

Inside the main `useEffect` in `ScreenshotAiApp`, add this listener:

```ts
    const onOcrReportText = (event: Event) => {
      const detail = (event as CustomEvent<OcrReportTextPayload>).detail;
      const text = detail?.text?.trim();
      if (!text) return;
      setOperation((current) => current ? `${current}\n\nOCR:\n${text}` : `OCR:\n${text}`);
      setStatus("OCR text attached");
    };
    window.addEventListener(OCR_REPORT_TEXT_EVENT, onOcrReportText);
```

Add cleanup in the same effect return:

```ts
      window.removeEventListener(OCR_REPORT_TEXT_EVENT, onOcrReportText);
```

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 3: Manual report verification**

Run:

```powershell
cd app
npm run tauri dev
```

Expected:

- Trigger OCR.
- Click `Send OCR text to screenshot report`.
- Screenshot report opens.
- The operation/context field includes an `OCR:` block.

- [ ] **Step 4: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/builtins/screenshotai/App.tsx app/src/entry/entryEvents.ts
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: attach OCR text to screenshot report"
```

## Milestone 3: Desktop Pet MVP

### Task 11: Build Disabled-by-Default Pet Entry

**Files:**
- Replace: `app/src/entry/PetEntryApp.tsx`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Implement pet UI**

Replace `app/src/entry/PetEntryApp.tsx`:

```tsx
import { useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const shell: CSSProperties = {
  width: "100vw",
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
};

export function PetEntryApp() {
  const [open, setOpen] = useState(false);

  async function openSearch() {
    await invoke("show_search_window");
  }

  async function openOcr() {
    await invoke("toggle_ocr_window");
  }

  return (
    <div style={shell}>
      <button
        title="DevLauncher"
        onClick={() => setOpen((value) => !value)}
        onDoubleClick={() => openSearch().catch(console.error)}
        onMouseDown={(event) => {
          if (event.button === 0) getCurrentWindow().startDragging().catch(() => {});
        }}
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.22)",
          background: "rgba(18,22,35,0.88)",
          color: "rgba(255,255,255,0.88)",
          cursor: "pointer",
          fontSize: 24,
        }}
      >
        DL
      </button>
      {open && (
        <div style={{
          position: "fixed",
          left: 72,
          top: 8,
          width: 180,
          borderRadius: 10,
          padding: 8,
          background: "rgba(18,22,35,0.96)",
          border: "1px solid rgba(255,255,255,0.14)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          <button onClick={() => openSearch().catch(console.error)}>Open Search</button>
          <button onClick={() => openOcr().catch(console.error)}>Start OCR</button>
          <button onClick={() => invoke("toggle_clipboard_window").catch(console.error)}>Clipboard</button>
          <button onClick={() => getCurrentWindow().hide().catch(() => {})}>Hide</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add temporary pet shortcut for testing**

In `app/src/App.tsx`, after OCR shortcut registration, add:

```ts
      if (!cancelled) {
        try {
          await registerShortcut(
            "Ctrl+Shift+P",
            makeDebounced(async () => {
              invoke("toggle_pet_window").catch(console.error);
            })
          );
        } catch (err) {
          console.warn("Ctrl+Shift+P pet shortcut unavailable:", err);
        }
      }
```

- [ ] **Step 3: Run checks**

Run:

```powershell
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 4: Manual pet verification**

Run:

```powershell
cd app
npm run tauri dev
```

Expected:

- `Ctrl+Shift+P` opens the pet window.
- Single click expands the light action panel.
- Double click opens search.
- Start OCR opens OCR window.
- Hide hides the pet window.

- [ ] **Step 5: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/entry/PetEntryApp.tsx app/src/App.tsx
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: add desktop pet entry"
```

## Milestone 4: Entry Settings and Final Verification

### Task 12: Add Minimal Entry Settings

**Files:**
- Modify: `app/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Add settings section type**

Change:

```ts
type SettingsSection = "appearance" | "webaccounts";
```

To:

```ts
type SettingsSection = "appearance" | "webaccounts" | "entries";
```

- [ ] **Step 2: Add sidebar button**

In the settings sidebar where section buttons are rendered, add an Entries button with the same style as the existing buttons:

```tsx
<button
  onClick={() => setActiveSection("entries")}
  style={{
    ...BUTTON,
    width: "100%",
    marginBottom: 8,
    background: activeSection === "entries" ? "rgba(59,130,246,0.22)" : BUTTON.background,
  }}
>
  Entries
</button>
```

- [ ] **Step 3: Add entries section content**

In the main content area, add:

```tsx
{activeSection === "entries" && (
  <section style={{ padding: 16, overflow: "auto" }}>
    <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Entries</h2>
    <div style={{ ...panelStyle, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Search</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
        Shortcut: Ctrl+Space. Searches keyboard bindings, built-ins, and recent actions.
      </div>
    </div>
    <div style={{ ...panelStyle, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>OCR</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
        Shortcut: Ctrl+Shift+O. Recognized text can be copied, searched, or sent to screenshot report.
      </div>
    </div>
    <div style={{ ...panelStyle, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Desktop pet</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
        Shortcut: Ctrl+Shift+P. Disabled by default in packaged UX until a persistent preference is added.
      </div>
    </div>
  </section>
)}
```

If `panelStyle` does not exist in `SettingsPanel.tsx`, define it near the existing style constants:

```ts
const panelStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.045)",
};
```

- [ ] **Step 4: Run checks**

Run:

```powershell
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/components/SettingsPanel.tsx
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: document entry shortcuts in settings"
```

### Task 13: Final Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run frontend tests**

Run:

```powershell
cd app
npm run test
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run Rust checks**

Run:

```powershell
cd app/src-tauri
cargo fmt --check
cargo check
```

Expected: PASS.

- [ ] **Step 4: Run manual smoke test**

Run:

```powershell
cd app
npm run tauri dev
```

Expected:

- Vite serves `http://localhost:1420/`.
- `app.exe` starts.
- `Alt+Space` toggles keyboard launcher.
- `Ctrl+Space` toggles search.
- Search opens at least one keyboard binding and one builtin.
- `Ctrl+Shift+O` opens OCR.
- OCR result can be copied.
- OCR result can open search.
- OCR result can open screenshot report.
- `Ctrl+Shift+P` opens pet.
- Pet can open search and OCR.

- [ ] **Step 5: Commit verification docs if changed**

If no files changed, do not commit. If verification notes were added to docs, commit only those docs:

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher status --short
```

Expected: no unexpected source changes.

## Rollback Strategy

If search causes runtime issues:

1. Remove `Ctrl+Space` shortcut registration from `app/src/App.tsx`.
2. Leave Action Index files in place if tests pass.
3. Hide the `search` window by keeping `visible: false`.

If OCR causes runtime issues:

1. Remove `Ctrl+Shift+O` shortcut registration from `app/src/App.tsx`.
2. Keep `app/src/entry/OcrEntryApp.tsx` behind the hidden `ocr` window.
3. Remove the OCR invoke handler from `lib.rs` only if it fails `cargo check`.

If pet causes runtime issues:

1. Remove `Ctrl+Shift+P` shortcut registration.
2. Keep the pet window hidden.
3. Do not enable pet from settings until the issue is fixed.

## Self-Review

- Spec coverage: Search entry, OCR result distribution, desktop pet light entry, existing keyboard preservation, action index, entry controller, and settings visibility are covered by Tasks 2 through 13.
- Scope check: Full AI pet, cloud sync, full file search, plugin marketplace, config migration, and complete AI OCR are excluded as required.
- Type consistency: The plan uses `LauncherActionRecord`, `LauncherActionSource`, `LauncherActionKind`, `FrontendCommand`, and event payload names consistently across tasks.
- Verification coverage: Each milestone has unit tests, build checks, Rust checks, and manual smoke checks.
