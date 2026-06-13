import type { BuiltinManifest } from "../types";

export const manifest: BuiltinManifest = {
  id: "screenshot",
  name: "截图",
  description: "全屏截图，区域选择，标注工具",
  emoji: "📸",
  window: { width: 1280, height: 800, resizable: false, alwaysOnTop: true },
};
