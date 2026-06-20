# DevLauncher Project Structure

本文档说明当前仓库中每个主要目录的作用。它用于新一轮开发前快速定位代码，而不是阶段性计划或需求备忘。

## 顶层目录

```text
devLauncher/
+-- .agents/                  # Agent/自动化相关本地配置，供协作工具读取
+-- .codebuddy/               # CodeBuddy 规则和技能配置
+-- .github/                  # GitHub Actions 与仓库说明类配置
+-- .superpowers/             # superpowers/brainstorm 运行时痕迹，非产品源码
+-- app/                      # 主桌面应用，Tauri + React + Rust
+-- docs/                     # 当前仍保留的设计、MCP、执行记录文档
+-- mcp/                      # 仓库级 MCP server 脚本
+-- plugins/                  # Codex 插件包
+-- scripts/                  # 仓库级脚本
+-- website/                  # 独立官网/展示页项目
+-- AGENTS.md                 # 本仓库给 Codex/Agent 的协作约束
+-- PROJECT_STRUCTURE.md      # 本文件
+-- README.md                 # 项目总览和开发入口
`-- package-lock.json         # 根目录历史锁文件；日常依赖主要在 app/ 和 website/
```

### 顶层文件说明

- `AGENTS.md`：编码、调试、文档、多步骤任务的协作要求，以及 UTF-8 处理规则。
- `README.md`：项目定位、功能、快捷键、开发命令和文档入口。
- `PROJECT_STRUCTURE.md`：代码目录说明。
- `package-lock.json`：根目录遗留锁文件。新增依赖优先在 `app/` 或 `website/` 内维护。

## `app/` 桌面应用

`app/` 是当前产品主体。它包含 React 前端、Tauri 配置、Rust 后端和桌面应用静态资源。

```text
app/
+-- .vscode/                  # 应用级 VS Code 配置
+-- dist/                     # Vite 构建产物，生成目录
+-- node_modules/             # npm 依赖，生成目录
+-- public/                   # Vite 静态资源
+-- scripts/                  # 应用级开发脚本
+-- src/                      # React + TypeScript 前端源码
+-- src-tauri/                # Rust 后端、Tauri 配置和桌面打包资源
+-- index.html                # Vite HTML 入口
+-- package.json              # 前端依赖和 npm scripts
+-- tsconfig*.json            # TypeScript 配置
`-- vite.config.ts            # Vite 配置
```

常用命令：

```bash
cd app
npm run build
npm test
npm run tauri dev
npm run tauri build
```

### `app/public/`

```text
app/public/
+-- pet/                      # 电子宠物图片帧资源
`-- ui/                       # UI 静态素材
```

`pet/siamese/` 下按动作分目录保存像素暹罗猫动画帧，例如待机和键盘跳跃动作。前端通过 `/pet/...` 路径引用。

### `app/src/`

```text
app/src/
+-- api/                      # Tauri invoke 封装与前端 API helper
+-- assets/                   # 前端源码引用的图片/图标资产
+-- builtins/                 # 内置工具窗口
+-- components/               # 共享 UI 组件
+-- entry/                    # 搜索、电子宠物等入口窗口
+-- icons/                    # 统一 SVG 图标系统
+-- launcher/                 # 动作索引、最近动作、动作执行逻辑
+-- motion/                   # 动画 token、preset、GSAP hook
+-- platform/                 # 平台差异 helper，例如快捷键映射
+-- store/                    # Zustand 状态
+-- types/                    # Action、配置、主题等 TypeScript 类型
+-- App.tsx                   # 虚拟键盘主窗口
+-- index.css                 # 全局样式和动效样式
`-- main.tsx                  # 根据 URL 参数路由到主窗口、入口窗口或内置工具
```

#### `app/src/api/`

- `config.ts`：加载、保存和定位 `keyboard.yaml` 配置。
- 后续前端 API helper 应放在这里，避免组件直接散落重复 invoke 逻辑。

#### `app/src/assets/`

放需要由前端模块 import 的资源。若资源应由浏览器 URL 直接访问，优先放 `app/public/`。

#### `app/src/builtins/`

内置工具窗口，每个功能通常包含 `manifest.ts` 和 `App.tsx`。

```text
app/src/builtins/
+-- clipboard/                # 剪贴板历史
+-- json/                     # JSON 助手
+-- quickmemory/              # 快捷记忆
+-- remotedesk/               # 远程桌面
+-- screenshot/               # 截图与标注
+-- screenshotai/             # 截图问题报告
+-- terminal/                 # 内置终端
+-- totp/                     # TOTP 令牌生成器
+-- webaccounts/              # 网页账号绑定
+-- _registry.ts              # 内置功能注册表
+-- screenshotStore.ts        # 截图报告共享存储
`-- types.ts                  # 内置功能 manifest 类型
```

新增内置功能时优先遵循已有目录模式，不要把新窗口塞进 `App.tsx`。

#### `app/src/components/`

共享 UI 组件，包括键盘面板、绑定弹窗、设置面板、窗口置顶按钮、剪贴板面板等。可复用组件放这里；仅属于某个内置工具的组件优先留在对应 `builtins/<id>/`。

#### `app/src/entry/`

独立入口窗口：

- `SearchPanel.tsx`：搜索入口。
- `PetEntryApp.tsx`：电子宠物入口。
- `BrowserPreviewApp.tsx`：浏览器预览/调试入口。
- `windowPosition.ts`：入口窗口位置持久化。

#### `app/src/icons/`

统一图标层：

- `IconBase.tsx`：图标基座。
- `controlIcons.tsx`：通用控制按钮图标。
- `entryIcons.tsx`：入口/菜单图标。
- `palette.ts`：图标颜色。
- `types.ts`：图标 props 类型。

#### `app/src/launcher/`

动作索引和执行逻辑。搜索、最近动作、键盘绑定最终都应复用这里的动作模型，避免入口之间行为分裂。

#### `app/src/motion/`

动画 token、preset 和 GSAP context helper。新增动画优先用这里的 token，而不是在组件里散写时长和曲线。

#### `app/src/platform/`

平台相关前端 helper。目前主要是全局快捷键字符串与可读 label 映射。后续平台差异逻辑也应集中到这里。

#### `app/src/store/`

Zustand store。当前主要状态在 `useKeyboardStore.ts`，包含键盘配置、主题、页面和设置面板状态。

#### `app/src/types/`

共享 TypeScript 类型，尤其是 `actions.ts`。新增动作类型必须从这里开始维护 schema。

### `app/src-tauri/`

Rust 后端和 Tauri 桌面配置。

```text
app/src-tauri/
+-- capabilities/             # Tauri 权限白名单
+-- gen/                      # Tauri 生成文件
+-- icons/                    # 桌面应用图标
+-- src/                      # Rust 源码
+-- target/                   # Cargo 构建产物，生成目录
+-- build.rs                  # Tauri build script
+-- Cargo.toml                # Rust 依赖
+-- Cargo.lock                # Rust 锁文件
`-- tauri.conf.json           # 窗口、打包、标识符和安全配置
```

#### `app/src-tauri/src/`

```text
app/src-tauri/src/
+-- actions.rs                # 通用动作执行：app/folder/file/url/ssh/script/system
+-- bin/                      # 额外二进制，例如 Chrome native host
+-- builtins/                 # 内置工具后端模块
+-- config.rs                 # keyboard.yaml 加载/保存/路径
+-- entries.rs                # 搜索、宠物、键盘等入口窗口控制
+-- lib.rs                    # Tauri Builder、插件、invoke handler、tray、快捷键
+-- main.rs                   # thin binary entry，调用 app_lib::run()
+-- ocr.rs                    # OCR 命令
+-- platform.rs               # OS 能力和命令规格差异
+-- types.rs                  # Rust 配置/动作类型
+-- utils/                    # favicon、图标、图片处理
`-- window_pinning.rs         # 窗口置顶/层级控制
```

#### `app/src-tauri/src/builtins/`

每个文件对应一个内置功能的后端命令：

- `clipboard.rs`：剪贴板历史、收藏、读写剪贴板。
- `json.rs`：JSON 工具窗口。
- `quickmemory.rs`：快捷记忆窗口。
- `remotedesk.rs`：远程桌面配置、主机、隧道和输入相关命令。
- `screenshot.rs`：截图窗口、待编辑截图、写文件。
- `screenshotai.rs`：截图问题报告窗口。
- `terminal.rs`：PTY 生命周期、写入、resize、执行命令。
- `totp.rs`：TOTP 窗口。
- `webaccounts.rs`：网页账号窗口。
- `mod.rs`：模块导出。

### 入口与窗口路由

- `app/src/main.tsx` 根据 URL 参数决定渲染哪个 React app。
- `?view=<id>` 用于内置工具窗口。
- `?entry=<id>` 用于搜索、电子宠物等入口窗口。
- `app/src-tauri/tauri.conf.json` 定义每个 Tauri window。
- `app/src-tauri/src/entries.rs` 和各 `builtins/*.rs` 提供 show/toggle 命令。

## `docs/`

```text
docs/
+-- prototypes/               # 原型或视觉参考材料
+-- superpowers/              # superpowers 生成的设计/执行记录
+-- devlauncher-pet-mcp.md    # 电子宠物 MCP 使用说明
`-- devlauncher-ui-final-spec.md # 当前 UI 视觉基线
```

保留 `docs/` 中仍能帮助维护当前实现的文档。阶段性计划和已过期草案不再放在根目录。

## `mcp/`

```text
mcp/
`-- devlauncher-pet-mcp.mjs   # 电子宠物 MCP server
```

该 server 将 Codex/MCP 事件写入 DevLauncher 的本地 inbox，桌面宠物再读取并展示状态。

## `plugins/`

```text
plugins/
`-- devlauncher-pet/
    +-- .codex-plugin/        # Codex plugin manifest
    +-- mcp/                  # 插件内 MCP server
    +-- skills/               # 插件随附技能说明
    `-- README.md             # 插件安装和使用说明
```

插件目录用于把 DevLauncher 宠物能力暴露给 Codex。不要把桌面应用源码放进这里。

## `scripts/`

```text
scripts/
+-- check-utf8.ps1            # UTF-8 文件检查
`-- pet-status.mjs            # 不经过 MCP 时写入宠物状态事件的 fallback 脚本
```

仓库级脚本放这里。仅供 `app/` 使用的脚本放 `app/scripts/`。

## `website/`

独立官网/展示页项目。

```text
website/
+-- public/                   # 官网静态资源
+-- scripts/                  # 官网 dev server PowerShell helper 和 build 脚本
+-- src/                      # 官网源码
+-- README.md                 # 官网运行、构建、部署说明
+-- package.json              # 官网 npm scripts
`-- server.mjs                # 官网本地 server
```

`website/` 不参与桌面应用运行。不要用官网行为判断 Tauri 桌面端行为。

## `.github/`

```text
.github/
+-- instructions/             # GitHub/Copilot 类编码说明
`-- workflows/                # GitHub Actions 工作流
```

## `.agents/`

本地 Agent 相关配置。用于开发协作工具读取，不是运行时产品代码。

## `.codebuddy/`

CodeBuddy 的规则和技能配置。不是 DevLauncher 应用运行时的一部分。

## `.superpowers/`

brainstorm/superpowers 工具运行痕迹。它可帮助追溯某些设计过程，但不是产品源码；一般不需要手工维护。

## 生成目录

这些目录由工具生成，通常不作为源码入口：

- `app/node_modules/`
- `app/dist/`
- `app/src-tauri/target/`
- `app/src-tauri/gen/`
- `website/dist/` 如果存在
- `.git/`

## 新增功能检查清单

新增或审计内置功能时，通常要一起看：

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

跟踪 `invoke(...)` 调用：

```bash
rg 'invoke\\("command_name' app/src
rg 'pub fn command_name|async fn command_name' app/src-tauri/src
```

## 验证命令

```bash
cd app
npm run build
npm test

cd app/src-tauri
cargo check
```

注意：当前依赖链要求 `rustc >= 1.88.0`。如果本机 Rust 版本较低，`cargo check` 会先失败在依赖版本检查。
