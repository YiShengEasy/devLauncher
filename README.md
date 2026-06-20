# DevLauncher

DevLauncher 是一个常驻后台的桌面效率启动器。它用 Tauri 2 + React 构建，核心入口是虚拟键盘、搜索入口和电子宠物入口，配套截图、剪贴板、终端、远程桌面等内置工具。

## 当前定位

- 用虚拟键盘把高频动作固定到可记忆的位置。
- 用搜索和独立工具窗口处理临时查询、截图、剪贴板、终端等工作流。
- 用电子宠物作为常驻入口，承载轻量操作菜单和后续 Codex 联动。
- 桌面应用代码在 `app/`，官网/展示页代码在 `website/`，两者彼此独立。

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 虚拟键盘 | 多页面按键绑定，支持应用、文件夹、文件、URL、SSH、脚本、系统命令和内置功能。 |
| 全局快捷键 | 呼出虚拟键盘、搜索、剪贴板和电子宠物；活动页面按键也可被快捷键触发。 |
| 搜索入口 | 搜索键盘绑定、内置功能和最近动作。 |
| 电子宠物 | 常驻像素暹罗猫入口，支持待机动画、键盘动作、快捷菜单和自定义动作入口。 |
| 截图工具 | 截图、区域选择、标注、复制、保存和发送到截图问题报告。 |
| 截图问题报告 | 汇总截图、编号说明、上下文和 AI Prompt。 |
| 剪贴板历史 | 记录剪贴板、收藏常用内容并快速恢复。 |
| 内置终端 | PTY 终端窗口和命令执行辅助。 |
| 远程桌面 | RDP 配置管理、局域网屏幕查看和远控相关辅助能力。 |
| 网页账号 | Chrome 网页账号绑定和安全填充说明。 |
| 快捷记忆 | 常用命令和快捷键速查，支持搜索、复制计数和排序。 |

## 默认快捷键

| 平台 | 快捷键 | 行为 |
| --- | --- | --- |
| macOS | `Cmd+Opt+J` | 呼出/隐藏虚拟键盘。 |
| macOS | `Cmd+Opt+K` | 打开搜索。 |
| macOS | `Cmd+Opt+V` | 打开剪贴板历史。 |
| macOS | `Cmd+Opt+P` | 呼出/隐藏电子宠物。 |
| macOS | `Cmd+Opt+<key>` | 触发当前页面对应按键绑定。 |
| Windows/Linux | `Ctrl+Alt+J` | 呼出/隐藏虚拟键盘。 |
| Windows/Linux | `Ctrl+Alt+K` | 打开搜索。 |
| Windows/Linux | `Ctrl+Alt+V` | 打开剪贴板历史。 |
| Windows/Linux | `Ctrl+Alt+P` | 呼出/隐藏电子宠物。 |
| Windows/Linux | `Alt+<key>` | 触发当前页面对应按键绑定。 |

虚拟键盘聚焦时还支持 `Tab` / `Shift+Tab` 切换页面。多数工具窗口支持 `Esc` 关闭或取消当前操作。

## 项目目录

更完整的目录说明见 [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)。

```text
devLauncher/
+-- app/                       # Tauri 桌面应用，包含 React 前端和 Rust 后端
+-- docs/                      # 仍需保留的设计、MCP 和执行记录文档
+-- mcp/                       # DevLauncher 电子宠物 MCP server
+-- plugins/                   # Codex 插件包
+-- scripts/                   # 仓库级辅助脚本
+-- website/                   # 独立官网/展示页
+-- AGENTS.md                  # Codex/Agent 仓库协作约定
+-- PROJECT_STRUCTURE.md       # 当前目录职责说明
+-- README.md                  # 项目总览
`-- package-lock.json          # 根目录历史锁文件，目前主要依赖在 app/ 和 website/
```

## 开发环境

建议版本：

- Node.js 18+
- Rust stable。当前依赖链要求 `rustc >= 1.88.0`。
- macOS 或 Windows，具备 Tauri 2 所需 WebView 环境。

安装桌面应用依赖：

```bash
cd app
npm install
```

运行桌面应用：

```bash
cd app
npm run tauri dev
```

构建前端：

```bash
cd app
npm run build
```

运行前端测试：

```bash
cd app
npm test
```

检查 Rust 后端：

```bash
cd app/src-tauri
cargo check
```

打包桌面应用：

```bash
cd app
npm run tauri build
```

## 内置功能开发入口

新增或审计内置功能时通常需要检查这些位置：

```text
app/src/builtins/<id>/manifest.ts
app/src/builtins/<id>/App.tsx
app/src/builtins/_registry.ts
app/src/types/actions.ts
app/src/components/BuiltinIcon.tsx
app/src-tauri/tauri.conf.json
app/src-tauri/capabilities/default.json
app/src-tauri/src/builtins/<id>.rs
app/src-tauri/src/builtins/mod.rs
app/src-tauri/src/lib.rs
```

前端通过 `invoke(...)` 调用 Rust 命令；命令名通常和 `app/src-tauri/src/**.rs` 中的 `#[tauri::command]` 函数名一致。

## 官网

`website/` 是独立的官网/展示页项目，不参与桌面应用运行。

```bash
cd website
npm run dev
npm run build
```

## 电子宠物 MCP

仓库包含 DevLauncher 电子宠物 MCP server 和 Codex 插件：

```text
mcp/devlauncher-pet-mcp.mjs
plugins/devlauncher-pet/
scripts/pet-status.mjs
docs/devlauncher-pet-mcp.md
```

详细安装和使用方式见 [docs/devlauncher-pet-mcp.md](docs/devlauncher-pet-mcp.md)。

## 说明

仓库曾包含多个阶段性计划文档。当前文档入口集中在：

- [README.md](README.md)
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- [docs/devlauncher-pet-mcp.md](docs/devlauncher-pet-mcp.md)
- [docs/devlauncher-ui-final-spec.md](docs/devlauncher-ui-final-spec.md)
- [website/README.md](website/README.md)
- [plugins/devlauncher-pet/README.md](plugins/devlauncher-pet/README.md)
