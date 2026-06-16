// -----------------------------------------------
// Action 类型系统 - V1 核心抽象
// -----------------------------------------------

import { manifest as clipboardManifest } from "@/builtins/clipboard/manifest";
import { manifest as jsonManifest }      from "@/builtins/json/manifest";
import { manifest as totpManifest }      from "@/builtins/totp/manifest";
import { manifest as remoteManifest }    from "@/builtins/remotedesk/manifest";
import { manifest as terminalManifest }  from "@/builtins/terminal/manifest";
import { manifest as screenshotAiManifest } from "@/builtins/screenshotai/manifest";
import { manifest as screenshotManifest }   from "@/builtins/screenshot/manifest";
import { manifest as webaccountsManifest }  from "@/builtins/webaccounts/manifest";
import { manifest as quickMemoryManifest }  from "@/builtins/quickmemory/manifest";

// 内置功能 manifest 列表（新增插件在此添加）
const _BUILTIN_MANIFESTS = [clipboardManifest, jsonManifest, totpManifest, remoteManifest, terminalManifest, screenshotAiManifest, screenshotManifest, webaccountsManifest, quickMemoryManifest] as const;

/** 内置功能 ID 联合类型，自动从 manifest 派生 */
export type BuiltinFeature = typeof _BUILTIN_MANIFESTS[number]["id"];

/** 内置功能元信息映射表，自动从 manifest 派生 */
export const BUILTIN_FEATURES = Object.fromEntries(
  _BUILTIN_MANIFESTS.map(m => [m.id, m])
) as Record<BuiltinFeature, typeof _BUILTIN_MANIFESTS[number]>;

export type ActionType = "app" | "folder" | "file" | "url" | "ssh" | "script" | "system" | "builtin";

interface ActionBase {
  type: ActionType;
  name: string;
  icon?: string;
}

export interface AppAction extends ActionBase {
  type: "app";
  target: string;
  args?: string[];
}

export type FolderOpenWith = "explorer" | "vscode" | "cursor" | "custom";

export interface FolderAction extends ActionBase {
  type: "folder";
  target: string;
  openWith?: FolderOpenWith;
  customOpener?: string;
  customOpenerArgs?: string;
}

export interface FileAction extends ActionBase {
  type: "file";
  target: string;
}

export interface UrlAction extends ActionBase {
  type: "url";
  target: string;
  username?: string;
  /** Password is stored in the OS credential store, not here. */
  hasPassword?: boolean;
  /** Open in Google Chrome and let the DevLauncher Chrome extension fill matching login forms. */
  autofill?: boolean;
  /** Submit after filling. Disabled by default for safety. */
  autoSubmit?: boolean;
  /** Optional CSS selector override for unusual login pages. */
  usernameSelector?: string;
  /** Optional CSS selector override for unusual login pages. */
  passwordSelector?: string;
}

export type SshTerminal = "auto" | "wt" | "cmd" | "powershell" | "gitbash" | "terminal";

export interface SshAction extends ActionBase {
  type: "ssh";
  host: string;
  user: string;
  port?: number;
  identity?: string;
  /** Password is stored in the OS credential store, not here. */
  hasPassword?: boolean;
  /** Preferred terminal for launching the SSH session. */
  terminal?: SshTerminal;
}

export interface ScriptAction extends ActionBase {
  type: "script";
  shell: "powershell" | "cmd" | "bat" | "wsl" | "terminal";
  content: string;
  file?: string;
}

export type SystemCommand =
  | "lock" | "sleep" | "calculator" | "notepad"
  | "explorer" | "taskmanager" | "shutdown" | "restart";

export interface SystemAction extends ActionBase {
  type: "system";
  command: SystemCommand;
}

export interface BuiltinAction extends ActionBase {
  type: "builtin";
  feature: BuiltinFeature;
}

// -----------------------------------------------
// Clipboard Entry (text + image)
// -----------------------------------------------

export type ClipboardEntry =
  | { kind: "text"; id: string; content: string }
  | { kind: "image"; id: string; data: string; width: number; height: number };

export const SYSTEM_PRESETS: { command: SystemCommand; name: string; emoji: string }[] = [
  { command: "calculator", name: "计算器", emoji: "🔢" },
  { command: "notepad",    name: "记事本", emoji: "📝" },
  { command: "explorer",   name: "文件管理器", emoji: "📂" },
  { command: "taskmanager",name: "任务管理器", emoji: "📊" },
  { command: "lock",       name: "锁屏", emoji: "🔒" },
  { command: "sleep",      name: "睡眠", emoji: "💤" },
  { command: "shutdown",   name: "关机", emoji: "⏻" },
  { command: "restart",    name: "重启", emoji: "🔄" },
];

export type Action =
  | AppAction
  | FolderAction
  | FileAction
  | UrlAction
  | SshAction
  | ScriptAction
  | SystemAction
  | BuiltinAction;

// -----------------------------------------------
// Page / Key layout
// -----------------------------------------------

export interface KeyBinding {
  action: Action | null;
}

export type KeyId =
  | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0"
  | "Q" | "W" | "E" | "R" | "T" | "Y" | "U" | "I" | "O" | "P"
  | "A" | "S" | "D" | "F" | "G" | "H" | "J" | "K" | "L"
  | "Z" | "X" | "C" | "V" | "B" | "N" | "M";

export const KEY_ROWS: KeyId[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

export type KeyMap = Partial<Record<KeyId, KeyBinding>>;

export interface Page {
  name: string;
  keys: KeyMap;
}

export interface ThemeConfig {
  bgColor: string;       // hex color, e.g. "#10121f"
  bgOpacity: number;     // 0-1, glass panel opacity
  blurRadius: number;    // backdrop blur px
  borderColor: string;   // hex color for border
  keyBgOpacity: number;  // unbound key background opacity 0-1
}

export const DEFAULT_THEME: ThemeConfig = {
  bgColor: "#101622",
  bgOpacity: 0.92,
  blurRadius: 24,
  borderColor: "#77778c78",
  keyBgOpacity: 0.055,
};

export interface KeyboardConfig {
  pages: Page[];
  theme?: ThemeConfig;
}

// -----------------------------------------------
// Action type metadata
// -----------------------------------------------

export const ACTION_TYPE_META: Record<ActionType, { label: string; color: string; bg: string }> = {
  app:    { label: "应用程序", color: "#60a5fa", bg: "rgba(37,99,235,0.75)" },
  folder: { label: "文件夹",   color: "#fbbf24", bg: "rgba(180,100,10,0.75)" },
  file:   { label: "文件",     color: "#fbbf24", bg: "rgba(180,100,10,0.75)" },
  url:    { label: "网址",     color: "#34d399", bg: "rgba(5,120,80,0.75)" },
  ssh:    { label: "SSH",      color: "#c084fc", bg: "rgba(120,40,180,0.75)" },
  script: { label: "脚本",     color: "#f87171", bg: "rgba(180,30,30,0.75)" },
  system: { label: "系统",     color: "#94a3b8", bg: "rgba(60,80,120,0.75)" },
  builtin: { label: "内置",    color: "#7dd3fc", bg: "rgba(18,22,45,0.90)" },
};
