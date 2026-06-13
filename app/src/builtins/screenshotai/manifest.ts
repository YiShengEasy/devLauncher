import type { BuiltinManifest } from "../types";

export const manifest: BuiltinManifest = {
  id: "screenshotai",
  name: "截图问题报告",
  description: "选择截图插件保存的截图，整理编号说明、上下文并生成 AI Prompt",
  emoji: "AI",
  window: { width: 1180, height: 720, resizable: true, alwaysOnTop: true },
};
