# DevLauncher 多入口形态调研与执行规划

日期：2026-06-13

## 目标与边界

当前 DevLauncher 的主入口是“虚拟键盘面板”：用户通过 `Alt+Space` 打开主窗口，通过页面和键位触发 app、folder、file、url、ssh、script、system、builtin 等动作。下一阶段目标不是替换虚拟键盘，而是让用户可以在多种入口形态之间切换，例如搜索框、浮动小球、托盘菜单、快捷命令面板等，并让不同入口形态承载更适合的功能。

本规划只做调研和实施路径设计，不包含本轮代码实现。

## 当前架构证据

仓库现状支持做“多入口形态”扩展，但需要先抽象入口层：

- 主应用在 `app/`，前端是 React + TypeScript，后端是 Tauri 2 + Rust。
- 主窗口在 `app/src/App.tsx` 中渲染虚拟键盘，当前 UI 直接围绕 `KeyboardPanel`、页面 tabs、绑定弹窗和设置面板组织。
- 动作模型已经相对通用，`app/src/types/actions.ts` 定义了 `Action` 联合类型，支持应用、文件夹、文件、URL、SSH、脚本、系统命令和内置功能。
- 配置模型目前叫 `KeyboardConfig`，核心结构是 `pages -> keys -> action`。这对虚拟键盘友好，但对搜索框、浮动小球、命令面板不够中性。
- 内置功能窗口已经具备插件式注册链：`manifest.ts`、`App.tsx`、`_registry.ts`、`tauri.conf.json`、Rust `toggle_*_window` 命令。
- `tauri.conf.json` 已经大量使用透明窗口、无边框、置顶、隐藏任务栏、独立窗口等能力，这为浮动小球、小面板、搜索框窗口提供了基础。
- `app/src-tauri/src/lib.rs` 已经接入 tray icon、菜单、全局快捷键、单实例恢复窗口。
- `app/src-tauri/capabilities/default.json` 已授权窗口显示/隐藏/聚焦、拖动和 global-shortcut 注册。

官方能力确认：

- Tauri 2 window API 支持 `setSkipTaskbar(true)`，但该能力在 macOS 上不支持；因此入口窗口的跨平台策略需要分平台处理。参考：https://v2.tauri.app/reference/javascript/api/namespacewindow/
- Tauri global-shortcut 插件可在 JavaScript 或 Rust 侧注册全局快捷键，但默认危险能力不启用，需要通过 capabilities 授权。参考：https://v2.tauri.app/plugin/global-shortcut/
- Tauri system tray 支持托盘图标、菜单、点击/双击/悬停等事件；Linux 托盘事件存在限制。参考：https://v2.tauri.app/learn/system-tray/

## 总体判断

多入口形态可行，建议按“入口壳层”和“动作执行核心”分离：

```text
Entry Mode UI
  keyboard | command palette | search bar | floating ball | tray menu | context panel
        |
        v
Launcher Action Index
  normalized actions, builtins, recent, favorites, context-aware actions
        |
        v
Action Executor
  invoke execute_action | invoke toggle_builtin_window | direct frontend local action
```

目前最大风险不是 Tauri 窗口能力，而是前端状态和配置命名过度绑定虚拟键盘。如果直接在 `App.tsx` 里堆搜索框、浮动球和菜单，会导致主入口越来越难维护。应先抽出可复用动作索引和入口模式配置。

## 推荐入口形态

### 1. 虚拟键盘入口

定位：保留为主入口，适合肌肉记忆和固定映射。

适合场景：

- 高频动作：打开项目、IDE、终端、浏览器、常用 URL。
- 用户已经记住 `Alt+<key>` 的固定位置。
- 需要按页面分组，例如 Dev、Ops、Docs、AI。
- 需要可视化绑定、拖拽换位和主题展示。

适合功能：

- 固定快捷键绑定。
- 多页面分组。
- 绑定管理。
- 对新用户展示“有哪些动作可用”。

不适合：

- 大量动作检索。
- 临时命令。
- 模糊搜索。
- 不知道快捷键位置时的快速查找。

### 2. 命令面板 / 搜索框入口

定位：推荐作为第二个核心入口，优先级最高。

适合场景：

- 用户记不住键位，但知道要找“terminal / ssh / docker / json / clipboard”。
- 动作数量超过键盘面板容量。
- 内置功能、绑定动作、最近使用、收藏动作需要统一检索。
- 想模仿 Raycast / Spotlight / VS Code Command Palette 的体验。

适合功能：

- 全局动作搜索。
- 模糊匹配和拼音/别名。
- 最近使用、收藏、置顶。
- 按类型过滤：App、URL、SSH、Script、Builtin。
- 对内置功能提供子命令，例如 `clipboard: clear`、`json: format clipboard`、`terminal: run npm build`。
- 上下文动作，例如当前项目目录下的 `npm run dev`、`git status`、打开 Cursor。

技术可行性：

- 可复用现有 `Action` 类型和 `execute_action`。
- 对 builtin 复用 `toggle_*_window` 命令。
- 前端需要新增动作索引层，把 `pages.keys` 摊平成 searchable records。
- 可先作为主窗口内的模式，再独立为小尺寸透明窗口。

建议快捷键：

- `Alt+Space` 可保留为主窗口。
- 新增 `Ctrl+Space` 或 `Alt+Enter` 打开搜索入口，具体需避开系统和 IDE 冲突。

### 3. 浮动小球入口

定位：轻量常驻入口，适合鼠标流和状态提醒，但不应承载复杂管理。

适合场景：

- 用户不想记快捷键。
- 需要在屏幕边缘随时呼出常用动作。
- 远程桌面、截图、剪贴板、终端等工具需要可见的“随手按钮”。
- 需要显示状态，例如远程 host 运行中、剪贴板有新收藏、截图待处理。

适合功能：

- 单击：展开迷你动作扇形菜单或最近动作列表。
- 双击：打开主入口或搜索框。
- 右键：托盘式菜单，包含设置、隐藏、退出。
- 拖动：吸附屏幕边缘，保存位置。
- 状态徽标：远程连接、截图待处理、剪贴板数量。

技术可行性：

- Tauri 已支持透明、无边框、置顶窗口。
- 需要新增一个 `floating` window label，例如 `index.html?entry=floating`。
- 前端要实现拖动、边缘吸附、展开小面板。
- 后端可能需要提供屏幕尺寸、窗口位置持久化；基础版也可用前端 window API。

主要风险：

- 多显示器、DPI 缩放、全屏应用覆盖行为需要实测。
- macOS/Linux 的置顶、隐藏任务栏、透明窗口行为和 Windows 不完全一致。
- 浮动小球容易打扰用户，必须支持关闭和入口形态切换。

### 4. 托盘菜单入口

定位：低打扰、系统级兜底入口。

适合场景：

- 主窗口隐藏后，仍能打开常用内置面板。
- 快速访问设置、最近动作、退出。
- 后台服务状态控制，例如远程桌面 host、FRP/ngrok、剪贴板。

适合功能：

- 打开主窗口。
- 打开设置。
- 最近 5 个动作。
- 打开 Clipboard、Terminal、Remote Desk、Screenshot。
- 服务状态：Start/Stop Remote Host、Start/Stop Tunnel。

技术可行性：

- 当前 Rust 侧已经创建托盘图标和菜单。
- 下一步可以从静态菜单扩展到动态菜单，但动态动作菜单要考虑前后端配置同步。
- 如果菜单项来自 `keyboard.yaml`，Rust 侧需要能读取同一份配置或由前端同步给后端。

风险：

- 托盘菜单不适合大量动作。
- Tauri 官方文档提示 Linux 托盘事件有限制，因此 Linux 不应作为第一阶段验收目标。

### 5. 上下文入口 / 项目入口

定位：让 DevLauncher 从“工具启动器”升级为“项目上下文启动器”。

适合场景：

- 同一个动作在不同项目里有不同含义，例如 `dev`、`build`、`test`、`open logs`。
- 用户想从项目卡片进入终端、IDE、Git、Docker、URL。
- 需要按当前目录或最近项目过滤动作。

适合功能：

- 项目卡片。
- 项目命令：dev/build/test/lint。
- 打开 IDE：Explorer、VS Code、Cursor、自定义工具。
- GitHub/Git actions。
- Docker compose actions。
- 项目级环境变量和脚本。

技术可行性：

- 当前 `FolderAction` 已支持 Explorer、VS Code、Cursor、自定义 opener。
- `ScriptAction` 和内置 terminal 已可执行命令。
- 需要新增项目模型，而不是把项目能力硬塞进键盘 key。

建议放到第二阶段之后，不要和搜索框/浮动小球同时展开。

## 入口形态与功能匹配矩阵

| 功能/场景 | 虚拟键盘 | 搜索框/命令面板 | 浮动小球 | 托盘菜单 | 项目入口 |
| --- | --- | --- | --- | --- | --- |
| 高频固定动作 | 强 | 中 | 中 | 弱 | 中 |
| 大量动作检索 | 弱 | 强 | 弱 | 弱 | 中 |
| 新手发现功能 | 中 | 强 | 中 | 弱 | 中 |
| 鼠标流快速启动 | 中 | 中 | 强 | 中 | 中 |
| 后台状态控制 | 弱 | 中 | 强 | 强 | 中 |
| 项目上下文命令 | 中 | 强 | 中 | 弱 | 强 |
| 截图/剪贴板随手入口 | 中 | 中 | 强 | 强 | 弱 |
| 远程桌面状态入口 | 中 | 中 | 强 | 强 | 中 |
| 配置管理 | 强 | 中 | 弱 | 弱 | 中 |

## 信息架构建议

建议把“键盘配置”逐步演进为更中性的“启动器配置”：

```text
LauncherConfig
  entry:
    defaultMode: keyboard | palette | floating | tray
    enabledModes: [...]
    shortcuts:
      main: Alt+Space
      palette: Ctrl+Space
  keyboard:
    pages: [...]
    theme: ...
  palette:
    includeBuiltins: true
    includeBindings: true
    includeRecent: true
  floating:
    enabled: true
    position: { monitor, x, y, edge }
    clickAction: open-palette | open-keyboard | show-ring
  actions:
    favorites: [...]
    recent: [...]
```

兼容策略：

- 第一阶段不要破坏现有 `keyboard.yaml`。
- 新增字段必须可选。
- `pages` 仍按旧格式读取。
- 前端内部可以先引入 `LauncherActionRecord`，但保存格式延后迁移。

## 技术实现路径

### Phase 0：入口层设计冻结

目标：先定义概念，不改运行行为。

交付：

- 定义入口模式枚举：`keyboard`、`palette`、`floating`、`tray`、`project`。
- 定义 `LauncherActionRecord`：从 key binding、builtin manifest、recent/favorite/project action 统一派生。
- 明确动作来源：keyboard binding、builtin、system preset、recent、favorite、project。
- 明确执行路径：普通 Action 调 `execute_action`，builtin 调 `toggle_*_window`。

验收：

- 能画出从入口 UI 到 action executor 的调用图。
- 不改变现有键盘行为。

### Phase 1：动作索引与搜索入口

目标：实现可搜索的命令面板，作为多入口的核心数据基础。

建议实现顺序：

1. 从 `KeyboardConfig.pages` 生成 searchable action records。
2. 从 `BUILTIN_REGISTRY` 生成 builtin action records。
3. 增加搜索排序：精确名称、别名、类型、最近使用、页面名。
4. 增加命令面板 UI，可先嵌在主窗口内。
5. 增加独立 palette window，并接入 global shortcut。
6. 记录 recent/favorites。

验收：

- 用户能通过搜索打开任何已绑定动作和内置功能。
- 键盘主入口仍按原逻辑工作。
- `npm run build` 和 `cargo check` 通过。

### Phase 2：入口模式设置

目标：让用户选择默认入口和启用入口。

建议实现顺序：

1. 设置面板增加入口模式设置。
2. 保存 `defaultEntryMode`、`enabledEntryModes`、palette 快捷键。
3. `Alt+Space` 根据默认入口打开 keyboard 或 palette。
4. 提供“恢复默认入口”。

验收：

- 用户可以在虚拟键盘和搜索框之间切换默认入口。
- 旧配置无新字段时仍正常打开虚拟键盘。

### Phase 3：浮动小球

目标：提供轻量常驻入口。

建议实现顺序：

1. 新增 floating window 配置：透明、无边框、置顶、小尺寸、默认隐藏任务栏。
2. 新增 `entry=floating` 路由。
3. 实现小球基础交互：拖动、单击展开、双击打开主入口、右键菜单。
4. 保存位置和启用状态。
5. 接入状态徽标：clipboard、remote desk、screenshot pending。

验收：

- 小球可启用/禁用。
- 重启后位置保持。
- 单击/双击/右键行为稳定。
- 多显示器和 DPI 至少在 Windows 主环境实测。

### Phase 4：托盘动态菜单增强

目标：把托盘从“显示/设置/退出”扩展为低打扰入口。

建议实现顺序：

1. 加入常用内置功能菜单项。
2. 加入最近动作菜单项。
3. 加入服务状态菜单项。
4. 明确 Rust 侧配置读取或前端同步策略。

验收：

- 托盘可直接打开 Clipboard、Terminal、Remote Desk、Screenshot。
- 远程服务状态不会误报。
- 菜单项数量受控，不把托盘变成完整命令面板。

### Phase 5：项目入口

目标：引入项目上下文，承载更强的开发者工作流。

建议实现顺序：

1. 定义 Project model：名称、路径、IDE、常用命令、URL、GitHub remote。
2. 从 folder binding 升级出项目卡片，不破坏原 folder action。
3. 支持项目级 actions：open IDE、open terminal、run dev、run test、Git status、Docker compose。
4. 在搜索框中按项目过滤命令。
5. 在虚拟键盘中支持“当前项目上下文”动作。

验收：

- 一个项目可配置并执行常用命令。
- 搜索框可查找项目动作。
- 旧 folder binding 行为不变。

## 推荐 MVP

最小可交付版本建议只做三件事：

1. 保留现有虚拟键盘。
2. 新增搜索框/命令面板入口。
3. 新增设置项：默认打开“虚拟键盘”或“搜索框”。

原因：

- 搜索入口能解决动作数量增长和记忆成本问题。
- 它复用现有动作模型，技术风险低。
- 它也是浮动小球、托盘动态菜单、项目入口的动作数据基础。

不建议 MVP 同时做浮动小球。浮动小球的窗口行为、位置保存、多显示器和交互打扰风险更高，应在动作索引稳定后做。

## 项目执行规划

### 第 1 周：设计和基础抽象

交付：

- `LauncherActionRecord` 设计。
- 动作来源整理：keyboard、builtin、recent、favorite。
- 搜索排序规则。
- 入口模式配置草案。

验证：

- 单元级验证 action record 生成逻辑。
- 旧配置加载不变。

### 第 2 周：命令面板 MVP

交付：

- 命令面板 UI。
- 搜索、键盘上下选择、回车执行、Esc 关闭。
- 可打开普通 action 和 builtin。
- 最近使用记录。

验证：

- `npm run build`。
- `cargo check`。
- 手动验证 app、folder、url、builtin、script 的执行路径。

### 第 3 周：入口切换

交付：

- 设置面板入口模式配置。
- 默认入口切换。
- 独立 palette window 或主窗口内 palette mode，视风险选择。
- 快捷键冲突提示。

验证：

- 旧用户默认仍进入虚拟键盘。
- 新用户可选择搜索框作为默认入口。
- 全局快捷键注册失败时有降级提示或日志。

### 第 4 周：浮动小球实验版

交付：

- floating window。
- 启用/禁用开关。
- 拖动和位置保存。
- 单击展开最近动作，双击打开搜索入口。

验证：

- Windows 主显示器、多显示器、DPI 缩放实测。
- 全屏应用、任务栏、置顶行为实测。
- 小球关闭后不残留不可见入口。

### 第 5 周：托盘菜单增强

交付：

- 常用内置功能菜单项。
- 最近动作菜单项。
- 远程/剪贴板/截图相关状态入口。

验证：

- 托盘左键/右键行为清晰。
- 动态菜单刷新稳定。
- 不影响主窗口快捷键。

### 第 6 周及以后：项目入口

交付：

- Project model。
- 项目卡片。
- 项目命令和项目过滤搜索。
- 与 folder opener、terminal、script action 打通。

验证：

- 项目动作可重复执行。
- 命令失败有可见反馈。
- 不污染普通键盘绑定配置。

## 风险清单

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 配置模型过度绑定 Keyboard | 后续入口难扩展 | 先内部引入中性 action index，配置迁移延后 |
| 全局快捷键冲突 | 入口打不开或覆盖用户习惯 | 提供可配置快捷键和注册失败提示 |
| 浮动小球打扰用户 | 用户反感、遮挡内容 | 默认关闭，可禁用，可吸边，尺寸克制 |
| 多窗口状态分散 | 窗口互相抢焦点或重复打开 | 统一 EntryController 管理 show/hide/focus |
| 托盘动态菜单和前端配置不同步 | 菜单执行旧动作 | Rust 读取同源配置或前端显式同步 |
| 跨平台窗口行为差异 | macOS/Linux 体验不一致 | 第一阶段以 Windows 验收，跨平台单独列兼容矩阵 |

## 关键设计原则

- 虚拟键盘是一个入口，不是整个产品模型。
- 搜索框应该成为动作总线的第一消费者。
- 浮动小球只做轻入口和状态提醒，不做完整设置。
- 托盘只做兜底和少量高频功能，不承载大量动作。
- 项目入口应基于项目模型，不应继续把所有东西塞进 key binding。
- 所有入口最终都调用同一套 action executor，避免不同入口执行结果不一致。

## 建议下一步

下一步应先做 Phase 0 和 Phase 1：抽象动作索引并实现命令面板 MVP。等搜索入口稳定后，再做浮动小球，因为浮动小球本质上也需要展示 recent/favorite/action index；如果先做小球，会迫使它直接读取键盘配置，后续会返工。
