export type GlobalShortcutId = "keyboard" | "clipboard" | "search" | "pet";

export type GlobalShortcutMap = Record<GlobalShortcutId, string>;

export function isMacPlatform(platform = navigator.platform): boolean {
  return platform.toLowerCase().startsWith("mac");
}

export function getGlobalShortcuts(platform = navigator.platform): GlobalShortcutMap {
  if (isMacPlatform(platform)) {
    return {
      keyboard: "DoubleControl",
      clipboard: "Option+V",
      search: "Option+K",
      pet: "Option+P",
    };
  }

  return {
    keyboard: "Ctrl+Alt+J",
    clipboard: "Ctrl+Alt+V",
    search: "Ctrl+Alt+K",
    pet: "Ctrl+Alt+P",
  };
}

export function getGlobalShortcutLabels(platform = navigator.platform): GlobalShortcutMap {
  if (isMacPlatform(platform)) {
    return {
      keyboard: "双击 Ctrl / Option+J",
      clipboard: "Option+V",
      search: "Option+K",
      pet: "Option+P",
    };
  }

  return {
    ...getGlobalShortcuts(platform),
    keyboard: "双击 Ctrl / Ctrl+Alt+J",
  };
}

export function keyIdToShortcut(keyId: string, platform = navigator.platform): string {
  const normalizedKey = keyId.toUpperCase();
  const keyPart = /^\d$/.test(normalizedKey) ? `Digit${normalizedKey}` : `Key${normalizedKey}`;
  if (isMacPlatform(platform)) {
    return `CommandOrControl+Option+${keyPart}`;
  }
  return `Alt+${keyPart}`;
}
