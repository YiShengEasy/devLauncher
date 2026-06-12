import type { BuiltinManifest } from "../types";

export const manifest: BuiltinManifest = {
  id: "terminal",
  name: "终端",
  description: "内置终端，支持命令执行与 SSH 会话",
  emoji: "🖥️",
  window: { width: 860, height: 520, resizable: true, alwaysOnTop: false },
};
