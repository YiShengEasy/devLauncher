import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTRY_POSITION_STORAGE_KEY,
  getStoredEntryPosition,
  setStoredEntryPosition,
  type EntryWindowMode,
} from "./windowPosition";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

describe("windowPosition", () => {
  it("stores and reads coordinates by mode", () => {
    setStoredEntryPosition("pet", { x: 120, y: 240 });

    expect(getStoredEntryPosition("pet")).toEqual({ x: 120, y: 240 });
    expect(getStoredEntryPosition("main")).toBeNull();
  });

  it("ignores corrupted storage", () => {
    localStorage.setItem(ENTRY_POSITION_STORAGE_KEY, "{bad json");

    expect(getStoredEntryPosition("pet")).toBeNull();
  });

  it("ignores invalid mode values", () => {
    localStorage.setItem(
      ENTRY_POSITION_STORAGE_KEY,
      JSON.stringify({
        pet: { x: "left", y: 20 },
      }),
    );

    expect(getStoredEntryPosition("pet")).toBeNull();
  });

  it("preserves other modes when setting one mode", () => {
    const modes: EntryWindowMode[] = ["main", "pet"];
    setStoredEntryPosition(modes[0], { x: 10, y: 20 });
    setStoredEntryPosition(modes[1], { x: 30, y: 40 });

    expect(getStoredEntryPosition("main")).toEqual({ x: 10, y: 20 });
    expect(getStoredEntryPosition("pet")).toEqual({ x: 30, y: 40 });
  });
});
