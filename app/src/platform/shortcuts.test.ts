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
      keyboard: "Ctrl+Alt+J",
      clipboard: "Ctrl+Alt+V",
      search: "Ctrl+Alt+K",
      pet: "Ctrl+Alt+P",
    });
    expect(keyIdToShortcut("Q", "Win32")).toBe("Alt+KeyQ");
    expect(keyIdToShortcut("1", "Win32")).toBe("Alt+Digit1");
  });

  it("uses double Control for keyboard mode on macOS while keeping key shortcuts", () => {
    expect(getGlobalShortcuts("MacIntel")).toEqual({
      keyboard: "DoubleControl",
      clipboard: "Option+V",
      search: "Option+K",
      pet: "Option+P",
    });
    expect(keyIdToShortcut("Q", "MacIntel")).toBe("CommandOrControl+Option+KeyQ");
    expect(keyIdToShortcut("1", "MacIntel")).toBe("CommandOrControl+Option+Digit1");
  });

  it("keeps direct virtual-key shortcuts separate from macOS fixed actions", () => {
    expect(keyIdToShortcut("J", "MacIntel")).toBe("CommandOrControl+Option+KeyJ");
    expect(keyIdToShortcut("K", "MacIntel")).toBe("CommandOrControl+Option+KeyK");
    expect(keyIdToShortcut("P", "MacIntel")).toBe("CommandOrControl+Option+KeyP");
    expect(keyIdToShortcut("V", "MacIntel")).toBe("CommandOrControl+Option+KeyV");
    expect(keyIdToShortcut("p", "MacIntel")).toBe("CommandOrControl+Option+KeyP");
  });

  it("returns readable labels for settings text", () => {
    expect(getGlobalShortcutLabels("MacIntel").keyboard).toBe("双击 Ctrl / Option+J");
    expect(getGlobalShortcutLabels("Win32").search).toBe("Ctrl+Alt+K");
    expect(getGlobalShortcutLabels("MacIntel").search).toBe("Option+K");
  });
});
