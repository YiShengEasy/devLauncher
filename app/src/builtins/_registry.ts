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

import { manifest as clipboardManifest } from "./clipboard/manifest";
import { manifest as jsonManifest }      from "./json/manifest";
import { manifest as totpManifest }      from "./totp/manifest";
import { manifest as remoteManifest }    from "./remotedesk/manifest";
import { manifest as terminalManifest }  from "./terminal/manifest";
import { manifest as screenshotAiManifest } from "./screenshotai/manifest";
import { manifest as screenshotManifest }   from "./screenshot/manifest";

import { ClipboardApp }   from "./clipboard/App";
import { JsonHelperApp }  from "./json/App";
import { TotpApp }        from "./totp/App";
import { RemoteDeskApp }  from "./remotedesk/App";
import { TerminalApp }    from "./terminal/App";
import { ScreenshotAiApp } from "./screenshotai/App";
import { ScreenshotApp }  from "./screenshot/App";

export interface BuiltinPlugin {
  manifest: BuiltinManifest;
  App: ComponentType;
}

export const BUILTIN_REGISTRY: BuiltinPlugin[] = [
  { manifest: clipboardManifest,    App: ClipboardApp },
  { manifest: jsonManifest,         App: JsonHelperApp },
  { manifest: totpManifest,         App: TotpApp },
  { manifest: remoteManifest,       App: RemoteDeskApp },
  { manifest: terminalManifest,     App: TerminalApp },
  { manifest: screenshotAiManifest, App: ScreenshotAiApp },
  { manifest: screenshotManifest,   App: ScreenshotApp },
];

/** 按 id 查找插件 */
export function findPlugin(id: string): BuiltinPlugin | undefined {
  return BUILTIN_REGISTRY.find(p => p.manifest.id === id);
}
