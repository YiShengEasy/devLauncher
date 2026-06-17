import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILTIN_CATEGORIES,
  BUILTIN_MEMORY_ITEMS,
  deleteCustomCategory,
  deleteCustomItem,
  filterMemoryItems,
  getOrderedCategoryItems,
  mergeQuickMemoryData,
  parseTags,
  validateCategoryDraft,
  validateItemDraft,
} from "./data";
import type { QuickMemoryData } from "./model";
import {
  COPY_COUNT_STORAGE_KEY,
  ORDER_STORAGE_KEY,
  mergeLocalQuickMemoryState,
} from "./storage";

const localStorageStub = (() => {
  let values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values = new Map();
    },
  };
})();

Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: localStorageStub,
  },
  configurable: true,
});

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

describe("quickmemory storage migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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
  });
});

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
