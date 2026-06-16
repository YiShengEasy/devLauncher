import { describe, expect, it } from "vitest";
import {
  getGlobalShortcutLabels,
  getGlobalShortcuts,
  isMacPlatform,
  keyIdToShortcut,
} from "./shortcuts";

describe("shortcut platform mapping", () => {
  it("detects macOS-like platform strings", () => {
    expect(isMacPlatform("MacIntel")).toBe(true);
    expect(isMacPlatform("MacPPC")).toBe(true);
    expect(isMacPlatform("Win32")).toBe(false);
    expect(isMacPlatform("Linux x86_64")).toBe(false);
  });

  it("keeps Windows shortcut behavior unchanged", () => {
    expect(getGlobalShortcuts("Win32")).toEqual({
      keyboard: "Ctrl+Alt+Space",
      clipboard: "Ctrl+Alt+V",
      search: "Ctrl+Alt+K",
      pet: "Ctrl+Alt+P",
    });
    expect(keyIdToShortcut("Q", "Win32")).toBe("Alt+KeyQ");
    expect(keyIdToShortcut("1", "Win32")).toBe("Alt+Digit1");
  });

  it("uses Cmd+Opt shortcuts on macOS", () => {
    expect(getGlobalShortcuts("MacIntel")).toEqual({
      keyboard: "CommandOrControl+Option+Space",
      clipboard: "CommandOrControl+Option+V",
      search: "CommandOrControl+Option+K",
      pet: "CommandOrControl+Option+P",
    });
    expect(keyIdToShortcut("Q", "MacIntel")).toBe("CommandOrControl+Option+KeyQ");
    expect(keyIdToShortcut("1", "MacIntel")).toBe("CommandOrControl+Option+Digit1");
  });

  it("returns readable labels for settings text", () => {
    expect(getGlobalShortcutLabels("Win32").search).toBe("Ctrl+Alt+K");
    expect(getGlobalShortcutLabels("MacIntel").search).toBe("Cmd+Opt+K");
  });
});
