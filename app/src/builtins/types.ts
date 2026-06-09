// -----------------------------------------------
// Builtin Plugin Manifest — 每个内置功能的自描述单元
// 新增内置功能只需提交：
//   src/builtins/<id>/manifest.ts
//   src/builtins/<id>/App.tsx
//   并在 _registry.ts 中注册
// -----------------------------------------------

export interface BuiltinWindowConfig {
  width: number;
  height: number;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  transparent?: boolean;
  decorations?: boolean;
}

export interface BuiltinManifest {
  /** 唯一 ID，对应 ?view=<id> 路由 和 toggle_<id>_window Rust 命令 */
  id: string;
  name: string;
  description: string;
  emoji: string;
  window: BuiltinWindowConfig;
}
