import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    localStorage.clear();
    vi.setSystemTime(new Date("2026-06-14T00:00:00Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    storage.clear();
  });

  it("stores the newest action first", () => {
    recordRecentAction(base);
    recordRecentAction({
      ...base,
      id: "builtin:terminal",
      title: "Terminal",
      source: "builtin",
      actionKind: "toggle-builtin",
      builtinFeature: "terminal",
    });

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
