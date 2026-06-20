export type GlobalShortcutId = "keyboard" | "clipboard" | "search" | "pet";

export type GlobalShortcutMap = Record<GlobalShortcutId, string>;

export function isMacPlatform(platform = navigator.platform): boolean {
  return platform.toLowerCase().startsWith("mac");
}

export function getGlobalShortcuts(platform = navigator.platform): GlobalShortcutMap {
  if (isMacPlatform(platform)) {
    return {
      keyboard: "CommandOrControl+Option+J",
      clipboard: "CommandOrControl+Option+V",
      search: "CommandOrControl+Option+K",
      pet: "CommandOrControl+Option+P",
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
      keyboard: "Cmd+Opt+J",
      clipboard: "Cmd+Opt+V",
      search: "Cmd+Opt+K",
      pet: "Cmd+Opt+P",
    };
  }

  return getGlobalShortcuts(platform);
}

export function keyIdToShortcut(keyId: string, platform = navigator.platform): string {
  const keyPart = /^\d$/.test(keyId) ? `Digit${keyId}` : `Key${keyId}`;
  if (isMacPlatform(platform)) {
    return `CommandOrControl+Option+${keyPart}`;
  }
  return `Alt+${keyPart}`;
}
