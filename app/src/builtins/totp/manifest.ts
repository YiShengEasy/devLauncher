import type { BuiltinManifest } from "../types";

export const manifest: BuiltinManifest = {
  id: "totp",
  name: "令牌生成器",
  description: "TOTP 两步验证码生成",
  emoji: "🔐",
  window: { width: 400, height: 560, resizable: true, alwaysOnTop: true },
};
