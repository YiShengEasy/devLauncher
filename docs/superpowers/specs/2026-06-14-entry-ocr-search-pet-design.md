# DevLauncher 搜索栏、OCR 与桌面电子宠物入口设计

日期：2026-06-14

## 设计结论

在保留现有虚拟键盘绑定形式的前提下，近期按“搜索栏优先，OCR 接入为动作”的方式落地；同时在文档和架构边界上采用统一入口内核，避免后续桌面电子宠物、托盘菜单、项目入口各自重复实现执行逻辑。

执行顺序：

1. 搜索栏入口 MVP
2. 框选 OCR
3. 桌面电子宠物轻入口状态助手

长期边界：

```text
Keyboard Binding
Builtin Tools
Recent / Favorite
OCR Result Actions
        |
        v
Action Index
        |
        v
Entry Controller
        |
        +-- Keyboard Entry
        +-- Search Bar Entry
        +-- Desktop Pet Entry
        +-- Tray Entry
        +-- Project Entry
```

## 当前前提

当前产品已经有一个稳定的虚拟键盘入口：

- 主窗口通过 `Alt+Space` 呼出。
- 动作绑定基于 `keyboard.yaml` 的页面和键位结构。
- 已支持 app、folder、file、url、ssh、script、system、builtin 等动作。
- 内置工具已经按 `?view=<id>` 和 `BUILTIN_REGISTRY` 分发到独立窗口。
- 现有截图、剪贴板、截图问题报告、Quick Memory 等能力可以作为搜索和 OCR 的第一批集成对象。

因此新入口不应替代键盘，而应成为“同一批动作的不同使用方式”。

## 目标

### 近期目标

近期只做两个主能力：

- 搜索栏入口：搜索已有键盘绑定、内置工具、最近动作，并直接执行。
- 框选 OCR：框选屏幕区域后识别文字，并把识别结果分发给复制、搜索栏、截图问题报告。

### 入口形态目标

- 虚拟键盘：继续承担固定高频动作和肌肉记忆。
- 搜索栏：承担大量动作检索、模糊查找、最近使用、OCR 文本后续处理。
- 桌面电子宠物：只做轻入口状态助手，不做复杂配置，不做完整 AI 对话。

### 非目标

近期不做：

- 完整 AI 桌面宠物对话系统。
- 复杂动画角色系统。
- 完整文件内容索引搜索。
- 云同步。
- 插件市场。
- 彻底迁移或重命名现有 `KeyboardConfig`。

## 方案选择

采用混合路线：

- 落地按方案 A：搜索栏优先，OCR 接入为动作。
- 架构按方案 C：提前定义 Action Index 和 Entry Controller 的边界。

理由：

- 搜索栏是最小可交付入口，能立刻解决“动作变多后记不住键位”的问题。
- OCR 可以作为搜索栏的输入来源，而不是单独做成孤立工具。
- 桌面电子宠物需要状态、最近动作和轻量展开面板；这些都依赖同一套动作索引。

## 搜索栏入口规划

### 定位

搜索栏是第二核心入口，类似 Raycast、PowerToys Run、VS Code Command Palette，但只服务 DevLauncher 自己的动作体系。

它不是替代键盘，而是补足键盘不擅长的场景：

- 用户记不住键位。
- 动作数量超过键盘面板容量。
- 需要按名称、类型、页面、标签搜索。
- 需要处理 OCR 后得到的文本。

### MVP 功能

第一版搜索栏支持：

- 搜索键盘绑定动作。
- 搜索内置工具。
- 搜索最近执行动作。
- 回车执行当前选中结果。
- 上下键切换结果。
- `Esc` 关闭。
- 空输入时展示最近动作和高频内置工具。
- 结果显示来源，例如 `Dev / Q`、`Builtin`、`Recent`。

### 搜索数据来源

第一版 Action Index 包含：

```text
Keyboard bindings
  pages[].keys[].action

Builtin tools
  BUILTIN_REGISTRY manifests

Recent actions
  local recent execution records

OCR result actions
  current OCR text generated action suggestions
```

### 搜索排序

建议排序规则：

1. 精确命中名称。
2. 名称前缀命中。
3. 页面名、键位、builtin id 命中。
4. 最近使用加权。
5. 内置工具加权。
6. 模糊命中。

中文支持先做包含匹配；拼音、首字母、语义搜索放到后续。

### 可执行结果类型

搜索栏结果分为几类：

| 类型 | 示例 | 执行方式 |
| --- | --- | --- |
| 绑定动作 | 打开项目、SSH、URL | 调用现有 `execute_action` |
| 内置工具 | Clipboard、Screenshot、Terminal | 调用 `toggle_*_window` |
| 最近动作 | 上次打开的项目 | 复用原始 action |
| OCR 分发动作 | 复制识别文字、搜索识别文字 | 前端分发或调用对应内置窗口 |

### 入口方式

第一版建议：

- 保留 `Alt+Space` 打开虚拟键盘。
- 新增一个可配置搜索快捷键，候选为 `Ctrl+Space` 或 `Alt+Enter`。
- 如果快捷键注册失败，记录日志并在设置页显示冲突提示。

后续可支持：

- 用户选择 `Alt+Space` 默认打开键盘或搜索栏。
- 电子宠物双击打开搜索栏。
- 托盘菜单打开搜索栏。

## 框选 OCR 规划

### 定位

OCR 是一个文本提取能力，不是单独的孤立窗口。它的结果要进入 DevLauncher 的统一动作分发链。

第一版只做“屏幕即时 OCR”：

1. 用户触发 OCR。
2. 进入框选区域。
3. 对框选区域截图。
4. 识别文字。
5. 展示结果分发面板。

### OCR 结果分发

识别成功后提供：

- 复制文本。
- 用搜索栏搜索该文本。
- 发送到截图问题报告。
- 保存到最近 OCR。

后续可增加：

- 翻译。
- 提取链接并打开。
- 提取命令并发送到终端。
- 提取错误信息并生成 AI 提问模板。

### OCR 与现有截图能力关系

当前仓库已有截图窗口和截图问题报告窗口。OCR 不应重复做一套截图管理，而应复用现有截图捕获和截图问题报告的方向：

- 框选截图能力可以靠近 `screenshot` built-in。
- OCR 结果可以发给 `screenshotai` built-in。
- OCR 历史可先轻量存在本地，不进入完整截图库。

### OCR MVP 范围

第一版只要求：

- 框选区域。
- 识别文字。
- 展示可复制结果。
- 一键把文字送入搜索栏。
- 一键把文字附加到截图问题报告。

不要求：

- 离线/在线 OCR 同时支持。
- 多语言高精度排版还原。
- 表格结构识别。
- PDF OCR。
- 批量 OCR。

### OCR 技术路线建议

需要在实现前单独确认 OCR 引擎。候选路线：

| 路线 | 优点 | 风险 |
| --- | --- | --- |
| Windows OCR API | Windows 体验好，可能无需大模型依赖 | 跨平台差，Rust/Tauri 接入要验证 |
| Tesseract 本地 OCR | 开源、离线、跨平台方向清晰 | 识别质量和打包体积要评估 |
| 外部 AI OCR | 质量高，能结合语义 | 需要网络、成本和隐私说明 |

近期如果以 Windows 为主，建议先评估 Windows OCR API 和 Tesseract；AI OCR 放到后续增强。

## 桌面电子宠物入口规划

### 定位

桌面电子宠物不是完整 AI 对话伙伴，而是低打扰的轻入口状态助手。

它的核心价值：

- 常驻可见。
- 提醒当前可处理状态。
- 快速打开搜索栏。
- 展开最近动作。
- 提示 OCR/截图/剪贴板状态。

### 交互设计

第一版交互：

- 单击：展开轻量动作面板。
- 双击：打开搜索栏。
- 右键：显示入口菜单，例如设置、隐藏、退出、打开主面板。
- 拖动：移动位置。
- 靠边：吸附屏幕左侧或右侧。

用户已选择“轻入口状态助手”，所以第一版应控制角色感，不做复杂情绪和对话。

### 状态提示

第一版可以显示：

- OCR 已识别文本待处理。
- 剪贴板有新内容。
- 截图问题报告有待处理截图。
- 搜索栏可用。

状态展示方式：

- 小徽标。
- 轻微高亮。
- 悬停 tooltip。
- 展开面板中的状态列表。

### 电子宠物展开面板

展开面板只放高频入口：

- 打开搜索栏。
- 开始 OCR 框选。
- 打开截图。
- 打开剪贴板。
- 最近 3 到 5 个动作。

不放：

- 完整设置。
- 大量动作列表。
- 复杂绑定管理。
- 长文本搜索结果。

### 与搜索栏关系

电子宠物不自己实现搜索。它只调用搜索栏入口：

```text
Pet click / double click
        |
        v
Entry Controller
        |
        v
Search Bar Entry
```

这样后续搜索体验只维护一套。

## 数据与配置规划

### 内部模型

建议新增内部概念，但不急于迁移配置文件：

```ts
type EntryMode = "keyboard" | "search" | "pet" | "tray";

interface LauncherActionRecord {
  id: string;
  title: string;
  subtitle?: string;
  source: "keyboard" | "builtin" | "recent" | "ocr";
  actionKind: "execute-action" | "toggle-builtin" | "frontend-command";
  action: unknown;
  keywords: string[];
  pageName?: string;
  keyId?: string;
  lastUsedAt?: number;
}
```

### 配置策略

短期不破坏现有 `keyboard.yaml`：

- `pages` 和 `keys` 继续按现有方式保存。
- 搜索栏 recent/favorite 可以先存在 localStorage 或独立本地配置。
- 入口模式配置可以后续进入 `settings.yaml` 或 `launcher.yaml`。

后续再考虑：

```yaml
entry:
  defaultMode: keyboard
  enabled:
    keyboard: true
    search: true
    pet: false
  shortcuts:
    keyboard: Alt+Space
    search: Ctrl+Space
pet:
  enabled: false
  edge: left
  position:
    x: 12
    y: 420
```

## 架构边界

### Action Index

职责：

- 从键盘配置生成可搜索动作。
- 从 builtin registry 生成内置动作。
- 合并最近动作。
- 接收 OCR 临时动作。
- 输出统一搜索结果。

不负责：

- 渲染 UI。
- 管理窗口。
- 执行动作细节。

### Entry Controller

职责：

- 打开键盘入口。
- 打开搜索栏入口。
- 打开或隐藏电子宠物入口。
- 控制窗口 show/hide/focus。
- 处理默认入口模式。

不负责：

- 生成搜索结果。
- OCR 识别。
- 具体动作执行。

### OCR Service

职责：

- 触发框选。
- 获取截图区域。
- 调用 OCR 引擎。
- 返回文本、置信度、来源截图信息。

不负责：

- 搜索排序。
- 长期截图库。
- AI 分析。

### Search Entry UI

职责：

- 输入查询。
- 展示结果。
- 键盘选择。
- 执行选中项。
- 展示 OCR 文本的分发动作。

不负责：

- 执行动作底层逻辑。
- 直接读取多个配置来源。

### Pet Entry UI

职责：

- 常驻展示。
- 状态徽标。
- 轻量展开面板。
- 打开搜索栏或 OCR。

不负责：

- 完整搜索。
- 完整设置。
- AI 对话。

## 分阶段执行规划

### Phase 1：搜索栏 MVP

交付：

- `Action Index` 初版。
- 搜索栏 UI。
- 支持键盘绑定和内置工具搜索。
- 支持执行搜索结果。
- 支持最近动作。

验收：

- 可以搜索并执行已有键盘绑定。
- 可以搜索并打开内置工具。
- 虚拟键盘行为不变。
- 构建和基础运行检查通过。

### Phase 2：OCR MVP

交付：

- OCR 触发动作。
- 框选区域。
- OCR 识别结果面板。
- 复制文本。
- 用搜索栏搜索 OCR 文本。
- 发送到截图问题报告。

验收：

- 能从屏幕区域识别出可复制文本。
- OCR 结果能进入搜索栏。
- OCR 结果能附加到截图问题报告。
- 失败时有明确错误提示。

### Phase 3：桌面电子宠物轻入口

交付：

- pet window 初版。
- 可启用/禁用。
- 单击展开轻量动作。
- 双击打开搜索栏。
- 显示 OCR/截图/剪贴板状态。

验收：

- 不影响原键盘入口。
- 关闭后不残留不可见窗口。
- 位置可保存。
- 默认不强制开启，避免打扰。

### Phase 4：入口模式设置

交付：

- 设置页增加入口启用项。
- 搜索快捷键配置。
- 电子宠物启用和位置设置。
- 默认入口选择。

验收：

- 旧配置仍默认打开虚拟键盘。
- 用户可以选择开启搜索栏和电子宠物。
- 快捷键冲突有提示。

## 风险与约束

| 风险 | 影响 | 处理方式 |
| --- | --- | --- |
| 搜索栏直接耦合 KeyboardConfig | 后续宠物和托盘复用困难 | 先抽 Action Index |
| OCR 引擎选择不稳 | 识别质量或打包复杂 | 实现前做 Windows OCR API 与 Tesseract spike |
| 电子宠物打扰用户 | 降低接受度 | 默认关闭，可隐藏，可吸边 |
| 多入口窗口状态混乱 | 抢焦点、重复窗口 | 用 Entry Controller 统一控制 |
| OCR 涉及隐私 | 用户担心截图内容泄露 | 默认本地处理；若接 AI OCR 必须显式提示 |
| 快捷键冲突 | 搜索栏打不开 | 快捷键可配置并显示注册失败 |

## 成功标准

近期版本成功标准：

- 用户不用记键位，也能通过搜索栏找到并执行已有动作。
- 用户能框选屏幕文字并快速复制或搜索。
- OCR 结果能自然进入现有截图问题报告流程。
- 桌面电子宠物能作为轻入口打开搜索栏和 OCR，但不打扰正常工作。
- 原虚拟键盘入口、页面、绑定和快捷键不被破坏。

## 推荐下一步

下一步不要直接做电子宠物 UI。先进入 Phase 1：

1. 设计 `LauncherActionRecord`。
2. 从现有 `KeyboardConfig.pages` 和 `BUILTIN_REGISTRY` 生成 Action Index。
3. 做搜索栏 MVP。
4. 再把 OCR 作为搜索栏可执行动作接入。

这样电子宠物上线时只需要消费现成的搜索栏和状态能力，而不是重新实现一套入口逻辑。
