import type { BuiltinManifest } from "../types";

export const manifest: BuiltinManifest = {
  id: "screenshotai",
  name: "截图标注",
  description: "选择截图插件保存的截图，添加编号说明并生成 AI Prompt",
  emoji: "AI",
  window: { width: 1180, height: 720, resizable: true, alwaysOnTop: true },
};

