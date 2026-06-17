# QuickMemory Custom Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable custom categories and custom command/shortcut memory items to the QuickMemory built-in while preserving the existing read-only default library.

**Architecture:** Keep built-in QuickMemory data in source as defaults, store only user-owned data and user state in a Tauri JSON file, and merge the two sources in front-end model helpers. Split the current large QuickMemory component into focused model, data, storage, and UI responsibilities so persistence and search behavior can be tested without rendering the full window.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, serde, serde_json.

---

## Scope Check

The approved spec covers one subsystem: the QuickMemory built-in. It touches front-end model/UI code and a small Tauri persistence command surface, but both are required for one working feature and should stay in one implementation plan.

## File Structure

- Create: `app/src/builtins/quickmemory/model.ts`
  - Owns shared TypeScript types and small constants such as `kindLabel`.
- Create: `app/src/builtins/quickmemory/data.ts`
  - Owns built-in categories/items, merge helpers, sorting cleanup, search filtering, and tag parsing.
- Create: `app/src/builtins/quickmemory/storage.ts`
  - Owns Tauri `invoke` calls and one-time migration from existing `localStorage` keys.
- Create: `app/src/builtins/quickmemory/quickmemory.test.ts`
  - Tests pure TypeScript data behavior.
- Modify: `app/src/builtins/quickmemory/App.tsx`
  - Uses model/data/storage helpers and adds custom category/item management UI.
- Modify: `app/src-tauri/src/builtins/quickmemory.rs`
  - Adds `QuickMemoryData` structs and JSON load/save helpers.
- Modify: `app/src-tauri/src/lib.rs`
  - Registers `load_quickmemory_data` and `save_quickmemory_data`.

## Task 1: Extract QuickMemory Model And Pure Data Helpers

**Files:**
- Create: `app/src/builtins/quickmemory/model.ts`
- Create: `app/src/builtins/quickmemory/data.ts`
- Create: `app/src/builtins/quickmemory/quickmemory.test.ts`
- Modify: `app/src/builtins/quickmemory/App.tsx`

- [ ] **Step 1: Create failing tests for merge, order cleanup, tag parsing, and search**

Create `app/src/builtins/quickmemory/quickmemory.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  BUILTIN_CATEGORIES,
  BUILTIN_MEMORY_ITEMS,
  filterMemoryItems,
  getOrderedCategoryItems,
  mergeQuickMemoryData,
  parseTags,
} from "./data";
import type { QuickMemoryData } from "./model";

describe("quickmemory data helpers", () => {
  it("merges built-in categories and custom user data", () => {
    const data: QuickMemoryData = {
      customCategories: [
        {
          id: "custom-ai",
          name: "AI",
          subtitle: "模型与提示词",
          accent: "#c084fc",
          createdAt: "2026-06-17T00:00:00.000Z",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      ],
      customItems: [
        {
          id: "custom-ai-chat",
          category: "custom-ai",
          title: "打开 ChatGPT",
          value: "open https://chatgpt.com",
          detail: "在默认浏览器打开 ChatGPT。",
          kind: "command",
          tags: ["ai", "web"],
          priority: true,
          createdAt: "2026-06-17T00:00:00.000Z",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      ],
      order: {},
      copyCounts: {},
    };

    const merged = mergeQuickMemoryData(data);

    expect(merged.categories.map((category) => category.id)).toContain("linux");
    expect(merged.categories.map((category) => category.id)).toContain("custom-ai");
    expect(merged.items.map((item) => item.id)).toContain("linux-ls");
    expect(merged.items.map((item) => item.id)).toContain("custom-ai-chat");
    expect(merged.items.find((item) => item.id === "custom-ai-chat")?.source).toBe("custom");
  });

  it("orders items by saved order and ignores missing ids", () => {
    const merged = mergeQuickMemoryData({
      customCategories: [],
      customItems: [
        {
          id: "custom-linux-z",
          category: "linux",
          title: "Custom Linux",
          value: "echo custom",
          detail: "Custom Linux command.",
          kind: "command",
          tags: ["custom"],
          priority: false,
          createdAt: "2026-06-17T00:00:00.000Z",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      ],
      order: {
        linux: ["missing-id", "custom-linux-z", "linux-pwd"],
      },
      copyCounts: {},
    });

    const ordered = getOrderedCategoryItems("linux", merged.items, merged.order);

    expect(ordered[0]?.id).toBe("custom-linux-z");
    expect(ordered[1]?.id).toBe("linux-pwd");
    expect(ordered.map((item) => item.id)).not.toContain("missing-id");
  });

  it("parses tags from comma and whitespace separated input", () => {
    expect(parseTags(" ai, web  ai shell ")).toEqual(["ai", "web", "shell"]);
  });

  it("searches title, command value, detail, kind, and tags", () => {
    const merged = mergeQuickMemoryData({
      customCategories: [],
      customItems: [],
      order: {},
      copyCounts: {},
    });

    expect(filterMemoryItems(BUILTIN_MEMORY_ITEMS, "ls -lah").map((item) => item.id)).toContain("linux-ls");
    expect(filterMemoryItems(BUILTIN_MEMORY_ITEMS, "inspect").map((item) => item.id)).toContain("linux-ls");
    expect(filterMemoryItems(merged.items, "快捷键").some((item) => item.kind === "shortcut")).toBe(true);
  });

  it("keeps the built-in library available", () => {
    expect(BUILTIN_CATEGORIES.length).toBeGreaterThan(0);
    expect(BUILTIN_MEMORY_ITEMS.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd app
npm test -- quickmemory
```

Expected: FAIL because `./data` and `./model` do not exist yet.

- [ ] **Step 3: Create the model types**

Create `app/src/builtins/quickmemory/model.ts` with:

```ts
export type MemoryKind = "command" | "shortcut";
export type MemorySource = "builtin" | "custom";
export type CategoryId = string;

export interface MemoryCategory {
  id: CategoryId;
  name: string;
  subtitle: string;
  accent: string;
  source: MemorySource;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemoryItem {
  id: string;
  category: CategoryId;
  title: string;
  value: string;
  detail: string;
  kind: MemoryKind;
  tags: string[];
  priority?: boolean;
  source: MemorySource;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomMemoryCategory {
  id: CategoryId;
  name: string;
  subtitle: string;
  accent: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomMemoryItem {
  id: string;
  category: CategoryId;
  title: string;
  value: string;
  detail: string;
  kind: MemoryKind;
  tags: string[];
  priority: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrderState = Record<CategoryId, string[]>;
export type CopyCounts = Record<string, number>;

export interface QuickMemoryData {
  customCategories: CustomMemoryCategory[];
  customItems: CustomMemoryItem[];
  order: OrderState;
  copyCounts: CopyCounts;
}

export interface MergedQuickMemoryData {
  categories: MemoryCategory[];
  items: MemoryItem[];
  order: OrderState;
  copyCounts: CopyCounts;
}

export interface PointerDragState {
  itemId: string;
  startX: number;
  startY: number;
  isDragging: boolean;
}

export const EMPTY_QUICKMEMORY_DATA: QuickMemoryData = {
  customCategories: [],
  customItems: [],
  order: {},
  copyCounts: {},
};

export const kindLabel: Record<MemoryKind, string> = {
  command: "命令",
  shortcut: "快捷键",
};
```

- [ ] **Step 4: Move built-in data and pure helpers out of `App.tsx`**

Create `app/src/builtins/quickmemory/data.ts` by moving the existing `CATEGORIES` and `MEMORY_ITEMS` contents from `App.tsx`, renaming them to `BUILTIN_CATEGORIES` and `BUILTIN_MEMORY_ITEMS`, and adding these helper functions:

```ts
import type {
  CategoryId,
  CustomMemoryCategory,
  CustomMemoryItem,
  MemoryCategory,
  MemoryItem,
  OrderState,
  QuickMemoryData,
} from "./model";

export const BUILTIN_CATEGORIES: MemoryCategory[] = [
  { id: "linux", name: "Linux / Shell", subtitle: "文件、进程、网络、排障", accent: "#5eead4", source: "builtin" },
  { id: "git", name: "Git", subtitle: "分支、提交、回滚、协作", accent: "#f97316", source: "builtin" },
  { id: "vscode", name: "VS Code", subtitle: "导航、编辑、重构、终端", accent: "#38bdf8", source: "builtin" },
  { id: "docker", name: "Docker", subtitle: "容器、镜像、日志、清理", accent: "#60a5fa", source: "builtin" },
  { id: "node", name: "Node / Package", subtitle: "npm、pnpm、调试、依赖", accent: "#a3e635", source: "builtin" },
];

export const BUILTIN_MEMORY_ITEMS: MemoryItem[] = [
  // The array body is the complete current MEMORY_ITEMS list from App.tsx.
  // Add source: "builtin" to each object and preserve all existing field values exactly.
];

export function toCustomCategory(category: MemoryCategory): CustomMemoryCategory {
  const now = new Date().toISOString();
  return {
    id: category.id,
    name: category.name.trim(),
    subtitle: category.subtitle.trim(),
    accent: category.accent,
    createdAt: category.createdAt ?? now,
    updatedAt: now,
  };
}

export function toCustomItem(item: MemoryItem): CustomMemoryItem {
  const now = new Date().toISOString();
  return {
    id: item.id,
    category: item.category,
    title: item.title.trim(),
    value: item.value.trim(),
    detail: item.detail.trim(),
    kind: item.kind,
    tags: normalizeTags(item.tags),
    priority: Boolean(item.priority),
    createdAt: item.createdAt ?? now,
    updatedAt: now,
  };
}

export function mergeQuickMemoryData(data: QuickMemoryData) {
  const customCategories: MemoryCategory[] = data.customCategories.map((category) => ({
    ...category,
    source: "custom",
  }));
  const categoryIds = new Set([...BUILTIN_CATEGORIES, ...customCategories].map((category) => category.id));
  const customItems: MemoryItem[] = data.customItems
    .filter((item) => categoryIds.has(item.category))
    .map((item) => ({
      ...item,
      source: "custom",
    }));

  return {
    categories: [...BUILTIN_CATEGORIES, ...customCategories],
    items: [...BUILTIN_MEMORY_ITEMS, ...customItems],
    order: data.order ?? {},
    copyCounts: data.copyCounts ?? {},
  };
}

export function getOrderedCategoryItems(
  category: CategoryId,
  items: MemoryItem[],
  orderState: OrderState
): MemoryItem[] {
  const baseItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.category === category)
    .sort((a, b) => {
      const priorityDiff = Number(Boolean(b.item.priority)) - Number(Boolean(a.item.priority));
      if (priorityDiff !== 0) return priorityDiff;
      return a.index - b.index;
    })
    .map(({ item }) => item);
  const validIds = new Set(baseItems.map((item) => item.id));
  const savedOrder = (orderState[category] ?? []).filter((id) => validIds.has(id));
  if (savedOrder.length === 0) return baseItems;

  const byId = new Map(baseItems.map((item) => [item.id, item]));
  const ordered = savedOrder.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const missing = baseItems.filter((item) => !savedOrder.includes(item.id));
  return [...ordered, ...missing];
}

export function filterMemoryItems(items: MemoryItem[], query: string): MemoryItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => {
    const haystack = [
      item.title,
      item.value,
      item.detail,
      item.kind,
      ...item.tags,
    ].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

export function parseTags(input: string): string[] {
  return normalizeTags(input.split(/[,\s]+/));
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export function createQuickMemoryId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
```

Important implementation note: `BUILTIN_MEMORY_ITEMS` must contain the complete current `MEMORY_ITEMS` array from `App.tsx`; each object must include `source: "builtin"`.

- [ ] **Step 5: Update `App.tsx` imports and remove duplicate local types/constants**

Modify the top of `app/src/builtins/quickmemory/App.tsx` so it imports the extracted data:

```ts
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyThemeFromConfig } from "@/api/theme";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import {
  BUILTIN_CATEGORIES,
  BUILTIN_MEMORY_ITEMS,
  filterMemoryItems,
  getOrderedCategoryItems,
} from "./data";
import { kindLabel, type MemoryItem, type OrderState, type PointerDragState } from "./model";
```

Then replace remaining references:

```ts
const CATEGORIES = BUILTIN_CATEGORIES;
const MEMORY_ITEMS = BUILTIN_MEMORY_ITEMS;
```

Remove the local `MemoryKind`, `MemoryItem`, `CategoryId`, `CATEGORIES`, `MEMORY_ITEMS`, `OrderState`, `PointerDragState`, and `kindLabel` declarations from `App.tsx`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
cd app
npm test -- quickmemory
npm run build
```

Expected: both commands PASS.

Commit:

```bash
git add app/src/builtins/quickmemory/model.ts app/src/builtins/quickmemory/data.ts app/src/builtins/quickmemory/quickmemory.test.ts app/src/builtins/quickmemory/App.tsx
git commit -m "refactor: extract quickmemory data model"
```

## Task 2: Add Tauri JSON Persistence

**Files:**
- Modify: `app/src-tauri/src/builtins/quickmemory.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add Rust tests for default, round-trip, and invalid JSON behavior**

Append this test module to `app/src-tauri/src/builtins/quickmemory.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_file(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("devlauncher-quickmemory-{}-{}.json", name, stamp))
    }

    #[test]
    fn read_missing_file_returns_default_data() {
        let path = temp_file("missing");
        let data = read_quickmemory_data_from_path(&path).expect("missing file should return defaults");

        assert!(data.custom_categories.is_empty());
        assert!(data.custom_items.is_empty());
        assert!(data.order.is_empty());
        assert!(data.copy_counts.is_empty());
    }

    #[test]
    fn write_and_read_quickmemory_data() {
        let path = temp_file("roundtrip");
        let data = QuickMemoryData {
            custom_categories: vec![QuickMemoryCategory {
                id: "custom-ai".into(),
                name: "AI".into(),
                subtitle: "模型与提示词".into(),
                accent: "#c084fc".into(),
                created_at: "2026-06-17T00:00:00.000Z".into(),
                updated_at: "2026-06-17T00:00:00.000Z".into(),
            }],
            custom_items: vec![QuickMemoryItem {
                id: "custom-ai-chat".into(),
                category: "custom-ai".into(),
                title: "打开 ChatGPT".into(),
                value: "open https://chatgpt.com".into(),
                detail: "在默认浏览器打开 ChatGPT。".into(),
                kind: "command".into(),
                tags: vec!["ai".into(), "web".into()],
                priority: true,
                created_at: "2026-06-17T00:00:00.000Z".into(),
                updated_at: "2026-06-17T00:00:00.000Z".into(),
            }],
            order: std::collections::HashMap::from([(
                "custom-ai".into(),
                vec!["custom-ai-chat".into()],
            )]),
            copy_counts: std::collections::HashMap::from([("custom-ai-chat".into(), 2)]),
        };

        write_quickmemory_data_to_path(&path, &data).expect("write should succeed");
        let loaded = read_quickmemory_data_from_path(&path).expect("read should succeed");

        assert_eq!(loaded.custom_categories[0].name, "AI");
        assert_eq!(loaded.custom_items[0].value, "open https://chatgpt.com");
        assert_eq!(loaded.copy_counts.get("custom-ai-chat"), Some(&2));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn invalid_json_returns_error_and_keeps_file() {
        let path = temp_file("invalid");
        fs::write(&path, "{broken json").expect("write invalid json");

        let result = read_quickmemory_data_from_path(&path);

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).expect("file should remain"), "{broken json");

        let _ = fs::remove_file(path);
    }
}
```

- [ ] **Step 2: Run Rust tests and verify they fail**

Run:

```bash
cd app/src-tauri
cargo test quickmemory
```

Expected: FAIL because `QuickMemoryData`, `read_quickmemory_data_from_path`, and `write_quickmemory_data_to_path` do not exist yet.

- [ ] **Step 3: Add persistence structs and helpers**

Replace `app/src-tauri/src/builtins/quickmemory.rs` with this structure while preserving `toggle_quickmemory_window`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuickMemoryData {
    #[serde(default)]
    pub custom_categories: Vec<QuickMemoryCategory>,
    #[serde(default)]
    pub custom_items: Vec<QuickMemoryItem>,
    #[serde(default)]
    pub order: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub copy_counts: HashMap<String, u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuickMemoryCategory {
    pub id: String,
    pub name: String,
    pub subtitle: String,
    pub accent: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuickMemoryItem {
    pub id: String,
    pub category: String,
    pub title: String,
    pub value: String,
    pub detail: String,
    pub kind: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub priority: bool,
    pub created_at: String,
    pub updated_at: String,
}

fn quickmemory_data_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("quickmemory_data.json")
}

fn read_quickmemory_data_from_path(path: &Path) -> Result<QuickMemoryData, String> {
    if !path.exists() {
        return Ok(QuickMemoryData::default());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_quickmemory_data_to_path(path: &Path, data: &QuickMemoryData) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_quickmemory_data(app: tauri::AppHandle) -> Result<QuickMemoryData, String> {
    let path = quickmemory_data_path(&app);
    read_quickmemory_data_from_path(&path)
}

#[tauri::command]
pub fn save_quickmemory_data(
    app: tauri::AppHandle,
    data: QuickMemoryData,
) -> Result<(), String> {
    let path = quickmemory_data_path(&app);
    write_quickmemory_data_to_path(&path, &data)
}

#[tauri::command]
pub fn toggle_quickmemory_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("quickmemory") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
```

Keep the test module from Step 1 at the end of the file.

- [ ] **Step 4: Register new Tauri commands**

In `app/src-tauri/src/lib.rs`, add these two entries near the existing quickmemory command:

```rust
builtins::quickmemory::load_quickmemory_data,
builtins::quickmemory::save_quickmemory_data,
builtins::quickmemory::toggle_quickmemory_window,
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cd app/src-tauri
cargo test quickmemory
```

Expected: PASS.

Commit:

```bash
git add app/src-tauri/src/builtins/quickmemory.rs app/src-tauri/src/lib.rs
git commit -m "feat: persist quickmemory user data"
```

## Task 3: Add Front-End Storage And LocalStorage Migration

**Files:**
- Create: `app/src/builtins/quickmemory/storage.ts`
- Modify: `app/src/builtins/quickmemory/quickmemory.test.ts`
- Modify: `app/src/builtins/quickmemory/App.tsx`

- [ ] **Step 1: Add tests for storage migration helpers**

Append these tests to `app/src/builtins/quickmemory/quickmemory.test.ts`:

```ts
import {
  COPY_COUNT_STORAGE_KEY,
  ORDER_STORAGE_KEY,
  mergeLocalQuickMemoryState,
} from "./storage";

describe("quickmemory storage migration", () => {
  it("merges existing localStorage order and copy counts into loaded data", () => {
    window.localStorage.setItem(COPY_COUNT_STORAGE_KEY, JSON.stringify({ "linux-ls": 3 }));
    window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify({ linux: ["linux-pwd", "linux-ls"] }));

    const merged = mergeLocalQuickMemoryState({
      customCategories: [],
      customItems: [],
      order: {},
      copyCounts: {},
    });

    expect(merged.copyCounts["linux-ls"]).toBe(3);
    expect(merged.order.linux).toEqual(["linux-pwd", "linux-ls"]);

    window.localStorage.removeItem(COPY_COUNT_STORAGE_KEY);
    window.localStorage.removeItem(ORDER_STORAGE_KEY);
  });

  it("keeps JSON data when localStorage contains invalid values", () => {
    window.localStorage.setItem(COPY_COUNT_STORAGE_KEY, "{bad");
    window.localStorage.setItem(ORDER_STORAGE_KEY, "{bad");

    const merged = mergeLocalQuickMemoryState({
      customCategories: [],
      customItems: [],
      order: { linux: ["linux-ls"] },
      copyCounts: { "linux-ls": 1 },
    });

    expect(merged.copyCounts["linux-ls"]).toBe(1);
    expect(merged.order.linux).toEqual(["linux-ls"]);

    window.localStorage.removeItem(COPY_COUNT_STORAGE_KEY);
    window.localStorage.removeItem(ORDER_STORAGE_KEY);
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd app
npm test -- quickmemory
```

Expected: FAIL because `./storage` does not exist yet.

- [ ] **Step 3: Create `storage.ts`**

Create `app/src/builtins/quickmemory/storage.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { EMPTY_QUICKMEMORY_DATA, type CopyCounts, type OrderState, type QuickMemoryData } from "./model";

export const COPY_COUNT_STORAGE_KEY = "devlauncher.quickmemory.copyCounts";
export const ORDER_STORAGE_KEY = "devlauncher.quickmemory.order";

export async function loadQuickMemoryData(): Promise<QuickMemoryData> {
  const data = await invoke<QuickMemoryData>("load_quickmemory_data");
  return mergeLocalQuickMemoryState(normalizeQuickMemoryData(data));
}

export async function saveQuickMemoryData(data: QuickMemoryData): Promise<void> {
  await invoke("save_quickmemory_data", { data: normalizeQuickMemoryData(data) });
}

export function mergeLocalQuickMemoryState(data: QuickMemoryData): QuickMemoryData {
  return {
    ...data,
    order: {
      ...readLocalOrderState(),
      ...data.order,
    },
    copyCounts: {
      ...readLocalCopyCounts(),
      ...data.copyCounts,
    },
  };
}

export function normalizeQuickMemoryData(data: Partial<QuickMemoryData> | null | undefined): QuickMemoryData {
  return {
    customCategories: Array.isArray(data?.customCategories) ? data.customCategories : [],
    customItems: Array.isArray(data?.customItems) ? data.customItems : [],
    order: normalizeOrderState(data?.order),
    copyCounts: normalizeCopyCounts(data?.copyCounts),
  };
}

function readLocalCopyCounts(): CopyCounts {
  try {
    const raw = window.localStorage.getItem(COPY_COUNT_STORAGE_KEY);
    if (!raw) return {};
    return normalizeCopyCounts(JSON.parse(raw));
  } catch {
    return {};
  }
}

function readLocalOrderState(): OrderState {
  try {
    const raw = window.localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return {};
    return normalizeOrderState(JSON.parse(raw));
  } catch {
    return {};
  }
}

function normalizeCopyCounts(value: unknown): CopyCounts {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      .map(([key, count]) => [key, Math.max(0, count)])
  );
}

function normalizeOrderState(value: unknown): OrderState {
  if (!value || typeof value !== "object") return {};
  const next: OrderState = {};
  for (const [categoryId, ids] of Object.entries(value)) {
    if (Array.isArray(ids)) {
      next[categoryId] = ids.filter((id): id is string => typeof id === "string");
    }
  }
  return next;
}

export function buildQuickMemoryDataPatch(current: QuickMemoryData, patch: Partial<QuickMemoryData>): QuickMemoryData {
  return normalizeQuickMemoryData({
    ...EMPTY_QUICKMEMORY_DATA,
    ...current,
    ...patch,
  });
}
```

- [ ] **Step 4: Wire load and save into `App.tsx`**

In `app/src/builtins/quickmemory/App.tsx`, import storage helpers:

```ts
import { loadQuickMemoryData, saveQuickMemoryData } from "./storage";
import { EMPTY_QUICKMEMORY_DATA, type QuickMemoryData } from "./model";
```

Replace the old `copyCounts` and `orderState` initializers with:

```ts
const [quickMemoryData, setQuickMemoryData] = useState<QuickMemoryData>(EMPTY_QUICKMEMORY_DATA);
const [loadError, setLoadError] = useState<string | null>(null);
const [saveError, setSaveError] = useState<string | null>(null);
```

Add load effect:

```ts
useEffect(() => {
  let cancelled = false;
  loadQuickMemoryData()
    .then((data) => {
      if (cancelled) return;
      setQuickMemoryData(data);
      setLoadError(null);
    })
    .catch((error) => {
      if (cancelled) return;
      setLoadError(error instanceof Error ? error.message : String(error));
    });
  return () => {
    cancelled = true;
  };
}, []);
```

Add helper:

```ts
const persistQuickMemoryData = async (next: QuickMemoryData) => {
  setQuickMemoryData(next);
  try {
    await saveQuickMemoryData(next);
    setSaveError(null);
  } catch (error) {
    setSaveError(error instanceof Error ? error.message : String(error));
  }
};
```

Use merged data:

```ts
const mergedData = useMemo(() => mergeQuickMemoryData(quickMemoryData), [quickMemoryData]);
const categories = mergedData.categories;
const memoryItems = mergedData.items;
const orderState = mergedData.order;
const copyCounts = mergedData.copyCounts;
```

Replace `CATEGORIES` with `categories`, `MEMORY_ITEMS` with `memoryItems`, `setCopyCounts` with updates to `quickMemoryData.copyCounts`, and `saveOrderState` with `persistQuickMemoryData({ ...quickMemoryData, order: nextOrder })`.

- [ ] **Step 5: Show load/save errors in the header**

Add this JSX near the header subtitle:

```tsx
{(loadError || saveError) && (
  <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 2 }}>
    {loadError ? `加载失败：${loadError}` : `保存失败：${saveError}`}
  </div>
)}
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
cd app
npm test -- quickmemory
npm run build
```

Expected: both commands PASS.

Commit:

```bash
git add app/src/builtins/quickmemory/storage.ts app/src/builtins/quickmemory/quickmemory.test.ts app/src/builtins/quickmemory/App.tsx
git commit -m "feat: load quickmemory user state"
```

## Task 4: Add Custom Category And Item CRUD UI

**Files:**
- Modify: `app/src/builtins/quickmemory/data.ts`
- Modify: `app/src/builtins/quickmemory/quickmemory.test.ts`
- Modify: `app/src/builtins/quickmemory/App.tsx`

- [ ] **Step 1: Add tests for validation and deletion behavior**

Append tests to `app/src/builtins/quickmemory/quickmemory.test.ts`:

```ts
import {
  deleteCustomCategory,
  deleteCustomItem,
  validateCategoryDraft,
  validateItemDraft,
} from "./data";

describe("quickmemory custom editing helpers", () => {
  it("validates category and item drafts", () => {
    expect(validateCategoryDraft({ name: "", subtitle: "x", accent: "#5eead4" })).toBe("类别名称不能为空");
    expect(validateCategoryDraft({ name: "AI", subtitle: "", accent: "#5eead4" })).toBeNull();
    expect(validateItemDraft({ title: "", value: "echo hi", detail: "", kind: "command", tagsText: "" })).toBe("标题不能为空");
    expect(validateItemDraft({ title: "Hi", value: "", detail: "", kind: "command", tagsText: "" })).toBe("内容不能为空");
    expect(validateItemDraft({ title: "Hi", value: "echo hi", detail: "", kind: "command", tagsText: "ai" })).toBeNull();
  });

  it("deletes a custom category, its custom items, and stale order entries", () => {
    const next = deleteCustomCategory({
      customCategories: [
        {
          id: "custom-ai",
          name: "AI",
          subtitle: "模型与提示词",
          accent: "#c084fc",
          createdAt: "2026-06-17T00:00:00.000Z",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      ],
      customItems: [
        {
          id: "custom-ai-chat",
          category: "custom-ai",
          title: "打开 ChatGPT",
          value: "open https://chatgpt.com",
          detail: "在默认浏览器打开 ChatGPT。",
          kind: "command",
          tags: ["ai"],
          priority: false,
          createdAt: "2026-06-17T00:00:00.000Z",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      ],
      order: { "custom-ai": ["custom-ai-chat"], linux: ["linux-ls", "custom-ai-chat"] },
      copyCounts: { "custom-ai-chat": 4 },
    }, "custom-ai");

    expect(next.customCategories).toEqual([]);
    expect(next.customItems).toEqual([]);
    expect(next.order["custom-ai"]).toBeUndefined();
    expect(next.order.linux).toEqual(["linux-ls"]);
    expect(next.copyCounts["custom-ai-chat"]).toBeUndefined();
  });

  it("deletes a custom item and cleans order and copy counts", () => {
    const next = deleteCustomItem({
      customCategories: [],
      customItems: [
        {
          id: "custom-linux",
          category: "linux",
          title: "Custom",
          value: "echo custom",
          detail: "",
          kind: "command",
          tags: [],
          priority: false,
          createdAt: "2026-06-17T00:00:00.000Z",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      ],
      order: { linux: ["linux-ls", "custom-linux"] },
      copyCounts: { "custom-linux": 2 },
    }, "custom-linux");

    expect(next.customItems).toEqual([]);
    expect(next.order.linux).toEqual(["linux-ls"]);
    expect(next.copyCounts["custom-linux"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd app
npm test -- quickmemory
```

Expected: FAIL because the editing helpers do not exist yet.

- [ ] **Step 3: Add editing helper functions**

Add to `app/src/builtins/quickmemory/data.ts`:

```ts
import type { MemoryKind, QuickMemoryData } from "./model";

export interface CategoryDraft {
  name: string;
  subtitle: string;
  accent: string;
}

export interface ItemDraft {
  title: string;
  value: string;
  detail: string;
  kind: MemoryKind;
  tagsText: string;
}

export function validateCategoryDraft(draft: CategoryDraft): string | null {
  if (!draft.name.trim()) return "类别名称不能为空";
  if (!draft.accent.trim()) return "强调色不能为空";
  return null;
}

export function validateItemDraft(draft: ItemDraft): string | null {
  if (!draft.title.trim()) return "标题不能为空";
  if (!draft.value.trim()) return "内容不能为空";
  return null;
}

export function deleteCustomCategory(data: QuickMemoryData, categoryId: string): QuickMemoryData {
  const itemIds = new Set(data.customItems.filter((item) => item.category === categoryId).map((item) => item.id));
  const copyCounts = { ...data.copyCounts };
  for (const id of itemIds) {
    delete copyCounts[id];
  }
  const order = Object.fromEntries(
    Object.entries(data.order)
      .filter(([key]) => key !== categoryId)
      .map(([key, ids]) => [key, ids.filter((id) => !itemIds.has(id))])
  );
  return {
    ...data,
    customCategories: data.customCategories.filter((category) => category.id !== categoryId),
    customItems: data.customItems.filter((item) => item.category !== categoryId),
    order,
    copyCounts,
  };
}

export function deleteCustomItem(data: QuickMemoryData, itemId: string): QuickMemoryData {
  const copyCounts = { ...data.copyCounts };
  delete copyCounts[itemId];
  return {
    ...data,
    customItems: data.customItems.filter((item) => item.id !== itemId),
    order: Object.fromEntries(
      Object.entries(data.order).map(([category, ids]) => [category, ids.filter((id) => id !== itemId)])
    ),
    copyCounts,
  };
}
```

If `data.ts` already imports from `./model`, merge imports into one import statement.

- [ ] **Step 4: Add dialog state to `App.tsx`**

In `QuickMemoryApp`, add:

```ts
const [categoryDialog, setCategoryDialog] = useState<{ mode: "create" | "edit"; categoryId?: string } | null>(null);
const [categoryDraft, setCategoryDraft] = useState({ name: "", subtitle: "", accent: "#5eead4" });
const [itemDialog, setItemDialog] = useState<{ mode: "create" | "edit"; itemId?: string } | null>(null);
const [itemDraft, setItemDraft] = useState({
  title: "",
  value: "",
  detail: "",
  kind: "command" as const,
  tagsText: "",
  priority: false,
  category: activeCategory,
});
const [formError, setFormError] = useState<string | null>(null);
```

Add create/edit handlers:

```ts
const openCreateCategory = () => {
  setCategoryDraft({ name: "", subtitle: "", accent: "#5eead4" });
  setFormError(null);
  setCategoryDialog({ mode: "create" });
};

const openEditCategory = (category: MemoryCategory) => {
  setCategoryDraft({ name: category.name, subtitle: category.subtitle, accent: category.accent });
  setFormError(null);
  setCategoryDialog({ mode: "edit", categoryId: category.id });
};

const openCreateItem = () => {
  setItemDraft({
    title: "",
    value: "",
    detail: "",
    kind: "command",
    tagsText: "",
    priority: false,
    category: activeCategory,
  });
  setFormError(null);
  setItemDialog({ mode: "create" });
};

const openEditItem = (item: MemoryItem) => {
  setItemDraft({
    title: item.title,
    value: item.value,
    detail: item.detail,
    kind: item.kind,
    tagsText: item.tags.join(", "),
    priority: Boolean(item.priority),
    category: item.category,
  });
  setFormError(null);
  setItemDialog({ mode: "edit", itemId: item.id });
};
```

- [ ] **Step 5: Add save/delete handlers**

Add these handlers to `App.tsx`:

```ts
const saveCategoryDraft = async () => {
  const error = validateCategoryDraft(categoryDraft);
  if (error) {
    setFormError(error);
    return;
  }
  const now = new Date().toISOString();
  const nextCategories = categoryDialog?.mode === "edit" && categoryDialog.categoryId
    ? quickMemoryData.customCategories.map((category) =>
        category.id === categoryDialog.categoryId
          ? { ...category, ...categoryDraft, name: categoryDraft.name.trim(), subtitle: categoryDraft.subtitle.trim(), updatedAt: now }
          : category
      )
    : [
        ...quickMemoryData.customCategories,
        {
          id: createQuickMemoryId("category"),
          name: categoryDraft.name.trim(),
          subtitle: categoryDraft.subtitle.trim(),
          accent: categoryDraft.accent,
          createdAt: now,
          updatedAt: now,
        },
      ];
  await persistQuickMemoryData({ ...quickMemoryData, customCategories: nextCategories });
  setCategoryDialog(null);
};

const saveItemDraft = async () => {
  const error = validateItemDraft(itemDraft);
  if (error) {
    setFormError(error);
    return;
  }
  const now = new Date().toISOString();
  const normalized = {
    category: itemDraft.category,
    title: itemDraft.title.trim(),
    value: itemDraft.value.trim(),
    detail: itemDraft.detail.trim(),
    kind: itemDraft.kind,
    tags: parseTags(itemDraft.tagsText),
    priority: itemDraft.priority,
    updatedAt: now,
  };
  const nextItems = itemDialog?.mode === "edit" && itemDialog.itemId
    ? quickMemoryData.customItems.map((item) =>
        item.id === itemDialog.itemId ? { ...item, ...normalized } : item
      )
    : [
        ...quickMemoryData.customItems,
        {
          id: createQuickMemoryId("memory"),
          ...normalized,
          createdAt: now,
        },
      ];
  await persistQuickMemoryData({ ...quickMemoryData, customItems: nextItems });
  setItemDialog(null);
};

const removeCustomCategory = async (categoryId: string) => {
  const category = categories.find((entry) => entry.id === categoryId);
  if (!category || category.source !== "custom") return;
  const confirmed = window.confirm(`删除分类“${category.name}”及其自定义记忆？`);
  if (!confirmed) return;
  const next = deleteCustomCategory(quickMemoryData, categoryId);
  await persistQuickMemoryData(next);
  setActiveCategory("linux");
};

const removeCustomItem = async (itemId: string) => {
  const item = memoryItems.find((entry) => entry.id === itemId);
  if (!item || item.source !== "custom") return;
  const confirmed = window.confirm(`删除记忆“${item.title}”？`);
  if (!confirmed) return;
  await persistQuickMemoryData(deleteCustomItem(quickMemoryData, itemId));
};
```

- [ ] **Step 6: Add category and item controls**

In the category sidebar, add a top button before category mapping:

```tsx
<button onClick={openCreateCategory} style={categoryActionButtonStyle}>
  新增类别
</button>
```

Inside each category button row, show edit/delete only for custom categories:

```tsx
{category.source === "custom" && (
  <span style={{ display: "flex", gap: 4 }}>
    <button onClick={(event) => { event.stopPropagation(); openEditCategory(category); }} style={miniButtonStyle}>编辑</button>
    <button onClick={(event) => { event.stopPropagation(); removeCustomCategory(category.id); }} style={miniButtonStyle}>删除</button>
  </span>
)}
```

In the main header action area, add:

```tsx
<button onClick={openCreateItem} style={primaryActionButtonStyle}>
  新增记忆
</button>
```

Inside each card footer, show edit/delete controls for custom items:

```tsx
{item.source === "custom" && (
  <span style={{ display: "flex", gap: 4 }}>
    <button onClick={(event) => { event.stopPropagation(); openEditItem(item); }} style={miniButtonStyle}>编辑</button>
    <button onClick={(event) => { event.stopPropagation(); removeCustomItem(item.id); }} style={miniButtonStyle}>删除</button>
  </span>
)}
```

Define these style constants in `App.tsx` outside the component:

```ts
const miniButtonStyle = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(248,250,252,0.76)",
  borderRadius: 6,
  padding: "2px 5px",
  fontSize: 10,
  cursor: "pointer",
};

const categoryActionButtonStyle = {
  width: "100%",
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#f8fafc",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

const primaryActionButtonStyle = {
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(94,234,212,0.38)",
  background: "rgba(94,234,212,0.12)",
  color: "#ccfbf1",
  cursor: "pointer",
  padding: "0 10px",
  fontSize: 12,
  fontWeight: 700,
};
```

- [ ] **Step 7: Add category and item dialogs**

Render these dialogs near `{renderDragGhost()}`:

```tsx
{categoryDialog && (
  <div style={dialogBackdropStyle}>
    <div style={dialogStyle}>
      <h2 style={dialogTitleStyle}>{categoryDialog.mode === "create" ? "新增类别" : "编辑类别"}</h2>
      <input value={categoryDraft.name} onChange={(event) => setCategoryDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="类别名称" style={dialogInputStyle} />
      <input value={categoryDraft.subtitle} onChange={(event) => setCategoryDraft((draft) => ({ ...draft, subtitle: event.target.value }))} placeholder="说明" style={dialogInputStyle} />
      <input value={categoryDraft.accent} onChange={(event) => setCategoryDraft((draft) => ({ ...draft, accent: event.target.value }))} placeholder="#5eead4" style={dialogInputStyle} />
      {formError && <div style={dialogErrorStyle}>{formError}</div>}
      <div style={dialogActionsStyle}>
        <button onClick={() => setCategoryDialog(null)} style={miniButtonStyle}>取消</button>
        <button onClick={saveCategoryDraft} style={primaryActionButtonStyle}>保存</button>
      </div>
    </div>
  </div>
)}

{itemDialog && (
  <div style={dialogBackdropStyle}>
    <div style={dialogStyle}>
      <h2 style={dialogTitleStyle}>{itemDialog.mode === "create" ? "新增记忆" : "编辑记忆"}</h2>
      <select value={itemDraft.category} onChange={(event) => setItemDraft((draft) => ({ ...draft, category: event.target.value }))} style={dialogInputStyle}>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
      <input value={itemDraft.title} onChange={(event) => setItemDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder="标题" style={dialogInputStyle} />
      <textarea value={itemDraft.value} onChange={(event) => setItemDraft((draft) => ({ ...draft, value: event.target.value }))} placeholder="命令或快捷键" style={{ ...dialogInputStyle, minHeight: 70, resize: "vertical" }} />
      <textarea value={itemDraft.detail} onChange={(event) => setItemDraft((draft) => ({ ...draft, detail: event.target.value }))} placeholder="说明" style={{ ...dialogInputStyle, minHeight: 60, resize: "vertical" }} />
      <select value={itemDraft.kind} onChange={(event) => setItemDraft((draft) => ({ ...draft, kind: event.target.value as "command" | "shortcut" }))} style={dialogInputStyle}>
        <option value="command">命令</option>
        <option value="shortcut">快捷键</option>
      </select>
      <input value={itemDraft.tagsText} onChange={(event) => setItemDraft((draft) => ({ ...draft, tagsText: event.target.value }))} placeholder="标签，用逗号或空格分隔" style={dialogInputStyle} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(226,232,240,0.72)" }}>
        <input type="checkbox" checked={itemDraft.priority} onChange={(event) => setItemDraft((draft) => ({ ...draft, priority: event.target.checked }))} />
        置顶
      </label>
      {formError && <div style={dialogErrorStyle}>{formError}</div>}
      <div style={dialogActionsStyle}>
        <button onClick={() => setItemDialog(null)} style={miniButtonStyle}>取消</button>
        <button onClick={saveItemDraft} style={primaryActionButtonStyle}>保存</button>
      </div>
    </div>
  </div>
)}
```

Define the dialog style constants:

```ts
const dialogBackdropStyle = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "rgba(2,6,23,0.62)",
  zIndex: 9000,
};

const dialogStyle = {
  width: 420,
  maxWidth: "calc(100vw - 36px)",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(15,23,42,0.98)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.42)",
  padding: 14,
  display: "grid",
  gap: 10,
};

const dialogTitleStyle = {
  margin: 0,
  fontSize: 15,
  color: "#f8fafc",
};

const dialogInputStyle = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#f8fafc",
  outline: "none",
  padding: "8px 10px",
  fontSize: 12,
  boxSizing: "border-box" as const,
};

const dialogErrorStyle = {
  fontSize: 12,
  color: "#fca5a5",
};

const dialogActionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};
```

- [ ] **Step 8: Run tests and commit**

Run:

```bash
cd app
npm test -- quickmemory
npm run build
```

Expected: both commands PASS.

Commit:

```bash
git add app/src/builtins/quickmemory/data.ts app/src/builtins/quickmemory/quickmemory.test.ts app/src/builtins/quickmemory/App.tsx
git commit -m "feat: edit quickmemory custom entries"
```

## Task 5: Final Validation And Manual QA

**Files:**
- Modify only if validation finds a defect in files changed by Tasks 1-4.

- [ ] **Step 1: Run full front-end tests**

Run:

```bash
cd app
npm test
```

Expected: PASS.

- [ ] **Step 2: Run front-end build**

Run:

```bash
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run Rust quickmemory tests**

Run:

```bash
cd app/src-tauri
cargo test quickmemory
```

Expected: PASS.

- [ ] **Step 4: Run the Tauri app for manual QA**

Run:

```bash
cd app
npm run tauri:dev:mac
```

Expected: the app launches without TypeScript or Rust compilation errors.

- [ ] **Step 5: Manual QA checklist**

In the QuickMemory window:

- [ ] Create a custom category named `AI`.
- [ ] Create a custom command in `AI` with title `打开 ChatGPT`, value `open https://chatgpt.com`, tags `ai web`.
- [ ] Search `ai` and verify the new item appears.
- [ ] Click the custom item and verify the copied count increases.
- [ ] Drag the custom item to change order, close and reopen QuickMemory, and verify the order remains.
- [ ] Edit the custom item title to `ChatGPT`.
- [ ] Delete the custom item and verify it disappears.
- [ ] Delete the `AI` category and verify the category disappears.
- [ ] Add a custom command under the built-in `Git` category and verify the built-in Git category remains.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git diff --stat HEAD
git diff -- app/src/builtins/quickmemory app/src-tauri/src/builtins/quickmemory.rs app/src-tauri/src/lib.rs
```

Expected: diff only contains QuickMemory custom data changes and command registration.

- [ ] **Step 7: Final commit if fixes were needed**

If Step 5 or Step 6 required fixes, commit the fixes:

```bash
git add app/src/builtins/quickmemory app/src-tauri/src/builtins/quickmemory.rs app/src-tauri/src/lib.rs
git commit -m "fix: polish quickmemory custom data"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: Tasks 1-4 cover editable custom categories, editable custom items, labels/tags, search, copy counts, drag order, JSON persistence, load/save errors, and read-only built-in data. Task 5 covers manual restart/persistence QA.
- Completeness scan: This plan contains no `TBD`, `TODO`, or open-ended implementation gaps. The only large mechanical move is explicitly bounded to copying the existing full `MEMORY_ITEMS` array and adding `source: "builtin"` to each object.
- Type consistency: TypeScript uses `customCategories`, `customItems`, `copyCounts`, `createdAt`, and `updatedAt`; Rust uses snake_case fields with `#[serde(rename_all = "camelCase")]`, so serialized JSON matches TypeScript.
