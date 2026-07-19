import type { Action, PluginAction, SshAction, UrlAction } from "@/types/actions";

const IDENTITY_COLORS = [
  "#38bdf8",
  "#2dd4bf",
  "#a3e635",
  "#facc15",
  "#fb923c",
  "#fb7185",
  "#c084fc",
  "#818cf8",
  "#60a5fa",
  "#34d399",
] as const;

function hashText(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function actionIdentityKey(action: Action): string {
  switch (action.type) {
    case "app":
    case "folder":
    case "file":
      return `${action.type}:${action.target}`;
    case "url":
      return `url:${(action as UrlAction).target}`;
    case "ssh": {
      const ssh = action as SshAction;
      return `ssh:${ssh.user}@${ssh.host}:${ssh.port ?? 22}`;
    }
    case "script":
      return `script:${action.file ?? action.name}:${action.shell}`;
    case "system":
      return `system:${action.command}`;
    case "builtin":
      return `builtin:${action.feature}`;
    case "plugin": {
      const plugin = action as PluginAction;
      return `plugin:${plugin.pluginId}:${plugin.actionId}`;
    }
    case "workflow":
      return `workflow:${action.workflowId}`;
  }
}

function urlLabel(target: string): string {
  try {
    return new URL(target.trim()).hostname.replace(/^www\./i, "").split(".")[0] || target;
  } catch {
    return target;
  }
}

function compactInitials(value: string): string {
  const words = value
    .trim()
    .split(/[\s._/@:-]+/u)
    .map((word) => Array.from(word).filter((char) => /[\p{L}\p{N}]/u.test(char)).join(""))
    .filter(Boolean);

  if (words.length >= 2) {
    return `${Array.from(words[0])[0]}${Array.from(words[1])[0]}`.toUpperCase();
  }

  return Array.from(words[0] ?? "?").slice(0, 2).join("").toUpperCase();
}

export function actionIconAccent(action: Action): string {
  return IDENTITY_COLORS[hashText(actionIdentityKey(action)) % IDENTITY_COLORS.length];
}

export function actionIconMonogram(action: Action): string {
  if (action.type === "url") {
    return compactInitials(urlLabel((action as UrlAction).target));
  }
  if (action.type === "ssh") {
    const ssh = action as SshAction;
    return compactInitials(action.name || ssh.host);
  }
  return compactInitials(action.name);
}
