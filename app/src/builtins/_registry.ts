// -----------------------------------------------
// Builtin Plugin Registry
// 新增内置功能步骤：
//   1. 创建 src/builtins/<id>/manifest.ts
//   2. 创建 src/builtins/<id>/App.tsx
//   3. 在下方 import 并加入 BUILTIN_REGISTRY
//   4. 在 src-tauri/tauri.conf.json 添加 window 配置
//   5. 在 src-tauri/src/lib.rs 添加 toggle_<id>_window 命令
// -----------------------------------------------

import type { BuiltinManifest } from "./types";
import type { ComponentType } from "react";
import { lazy } from "react";

import { manifest as clipboardManifest } from "./clipboard/manifest";
import { manifest as jsonManifest }      from "./json/manifest";
import { manifest as totpManifest }      from "./totp/manifest";
import { manifest as remoteManifest }    from "./remotedesk/manifest";
import { manifest as terminalManifest }  from "./terminal/manifest";
import { manifest as screenshotAiManifest } from "./screenshotai/manifest";
import { manifest as screenshotManifest }   from "./screenshot/manifest";
import { manifest as webaccountsManifest } from "./webaccounts/manifest";
import { manifest as quickMemoryManifest } from "./quickmemory/manifest";
import { manifest as projectTasksManifest } from "./projecttasks/manifest";

export interface BuiltinPlugin {
  manifest: BuiltinManifest;
  App: ComponentType;
}

export const BUILTIN_REGISTRY: BuiltinPlugin[] = [
  { manifest: clipboardManifest,    App: lazy(() => import("./clipboard/App").then(m => ({ default: m.ClipboardApp }))) },
  { manifest: jsonManifest,         App: lazy(() => import("./json/App").then(m => ({ default: m.JsonHelperApp }))) },
  { manifest: totpManifest,         App: lazy(() => import("./totp/App").then(m => ({ default: m.TotpApp }))) },
  { manifest: remoteManifest,       App: lazy(() => import("./remotedesk/App").then(m => ({ default: m.RemoteDeskApp }))) },
  { manifest: terminalManifest,     App: lazy(() => import("./terminal/App").then(m => ({ default: m.TerminalApp }))) },
  { manifest: screenshotAiManifest, App: lazy(() => import("./screenshotai/App").then(m => ({ default: m.ScreenshotAiApp }))) },
  { manifest: screenshotManifest,   App: lazy(() => import("./screenshot/App").then(m => ({ default: m.ScreenshotApp }))) },
  { manifest: webaccountsManifest,  App: lazy(() => import("./webaccounts/App").then(m => ({ default: m.WebAccountsApp }))) },
  { manifest: quickMemoryManifest,  App: lazy(() => import("./quickmemory/App").then(m => ({ default: m.QuickMemoryApp }))) },
  { manifest: projectTasksManifest, App: lazy(() => import("./projecttasks/App").then(m => ({ default: m.ProjectTasksApp }))) },
];

/** 按 id 查找插件 */
export function findPlugin(id: string): BuiltinPlugin | undefined {
  return BUILTIN_REGISTRY.find(p => p.manifest.id === id);
}
