# 实施计划

## 实施顺序与依赖

本计划先建立本地项目身份与安全引用，再扩展任务发现，最后增加持久运行中心和只读 MCP 面。不得在项目范围、引用验证和审计模型未完成前开放 MCP 执行。

## Phase 0：设计冻结与基线审计

- [ ] 记录 `ProjectProfile`、`ProjectTaskRef`、`RunRecord` 的 schema、生命周期和保留策略。
- [ ] 明确 `projecttasks_data.json` 与现有 `keyboard.yaml`、云同步快照的所有权边界：本机路径和运行历史不进入同步。
- [ ] 审计 `projecttasks.rs`、`projectconfigs.rs`、`workflow.rs`、终端和 Automation MCP 的现有调用路径，列出可复用验证器与必须替换的 Shell 快照路径。
- [ ] 为项目根移动、符号链接、Git 不可用、provider 超时、运行历史写入失败和应用重启中断确定用户可见文案。

**完成条件：** 文档模型通过评审；不存在“前端直接执行/写入”或“把绝对路径同步到云端”的未决设计。

## Phase 1：项目档案与本地迁移

- [ ] 在 Rust 新增版本化 `ProjectWorkbenchData`：`ProjectProfile`、本机根目录映射、迁移标记与收藏引用；由应用数据目录单独持久化。
- [ ] 从 `ProjectTasksData` 迁移项目历史、任务收藏和配置收藏，保持排序与 24 项历史上限；迁移可重复执行且不会删除旧数据，直到验证成功。
- [ ] 建立 `canonical_project_root`、项目 ID 生成、根目录可用性和可选 Git 远端指纹校验，拒绝越界路径与不可用目录。
- [ ] 提供共享 Rust 命令：创建/更新/列出/重新定位/删除本机项目档案；写入采用临时文件加原子 rename。
- [ ] 前端抽取项目选择与项目上下文 store，替换 `lastRoot` 作为跨窗口隐式通信的用途，同时保留其作为旧版迁移输入。
- [ ] 为 serde 默认值、迁移、重复迁移、失效根目录、根目录重定位和原子写入错误添加 Rust/TypeScript 测试。

**完成条件：** 既有项目历史无数据丢失地显示为项目档案；项目根目录仅存于本机应用数据。

## Phase 2：声明式任务发现适配器

- [ ] 定义 Rust `ProjectTaskProvider` 接口及规范化 `TaskCandidate`/诊断类型；每个候选项带 provider、source key、相对来源文件、行号（可获取时）、风险与可执行性。
- [ ] 将现有 Runme 发现和执行前重新验证封装为首个 provider，保留“显式 name”“CLI 不可用回退”和命令 quoting 行为。
- [ ] 实现第一个新增只读 provider：解析 `package.json` 的 `scripts`，不运行 `npm`/`pnpm`/`yarn`，只生成待确认候选项。
- [ ] 设计并预留 Makefile、Taskfile、CI provider 注册点；只有包含明确、可定位的手工任务时才接入，避免把任意 CI 配置转换为可执行动作。
- [ ] 为扫描深度、文件数、文件大小、子进程和 Git 元数据读取加入上限、取消令牌及诊断；继续使用 `spawn_blocking` 使 UI 不被阻塞。
- [ ] 为 provider 解析、同名去重/分组、超限、恶意路径、Runme 缺失和不执行保证添加 fixture 测试。

**完成条件：** Runme 与 `package.json` scripts 同时可发现、可区分、可预览，扫描过程不运行项目命令。

## Phase 3：引用型任务工作流

- [ ] 在共享 Action schema 增加向后兼容的 `ProjectTaskAction`/`ProjectTaskRef`；保持旧 `ScriptAction` 的语义和序列化不变。
- [ ] 运行前以 `projectId` 解析本机根目录，调用匹配 provider 重新验证来源和 source key，再在 Rust 侧生成命令；禁止前端传入未验证的工作目录或命令覆盖。
- [ ] 为“保存为工作流”增加引用预览，展示将绑定的项目、来源、任务、风险和无法解析时的结果。
- [ ] 为旧 ScriptAction 增加显式转换向导：只有项目、来源与任务匹配时显示可转换；保存前继续走现有 revision/原子写入流程。
- [ ] 更新工作流验证、执行引擎、类型、图标/文案、MCP capability 返回值和跨平台降级处理。
- [ ] 测试项目移动、任务改名、定义文件改动、源文件越界、旧工作流、工作流同步和手动取消。

**完成条件：** 新项目任务工作流不依赖陈旧 Shell 快照；旧工作流不被自动破坏或静默改写。

## Phase 4：持久运行中心

- [ ] 设计版本化本地运行存储，记录项目/工作流引用、不可变且脱敏的启动快照、状态时间线、步骤摘要和终端会话引用；每次状态变更原子更新。
- [ ] 将 `WorkflowEngineInner.runs` 作为活动运行缓存，同时把项目相关终态写入本地运行历史；启动时将未终态记录标记为“应用重启中断”。
- [ ] 实现每设备 500 条上限、仅清理最早已终态记录、手动清空、写入失败提示和不持久化完整输出的规则。
- [ ] 添加运行中心 UI：活动运行优先、项目/状态/触发方式筛选、步骤时间线、脱敏摘要、复制摘要和只对活动运行显示取消。
- [ ] 让工作流面板与项目任务窗口跳转到同一个运行详情；保留既有终端作为实时交互与输出承载。
- [ ] 在宠物启用状态下发送最小运行摘要事件；按项目名/状态显示，禁止包含命令、路径和输出。
- [ ] 为持久化、重启恢复、保留上限、脱敏、终端会话关联、取消和 UI 过滤编写自动化与人工验证用例。

**完成条件：** 应用重启后用户仍可审阅最近项目运行，且不会把中断运行误标为成功。

## Phase 5：项目工作台 UI 与只读 MCP

- [ ] 在现有“项目任务”窗口逐步加入概览、任务、配置、工作流、运行五个区域，复用 `ProjectConfigsPanel` 与工作流组件，不复制配置保存逻辑。
- [ ] 在搜索、虚拟键盘和工作流面板增加项目上下文入口，并为失效项目提供“重新定位”而非隐式回退到最近目录。
- [ ] 为 Automation MCP 扩展只读 capability、列表、项目详情、任务发现、任务引用预览和运行记录工具；输入与输出均使用共享 Rust 模型。
- [ ] 将 MCP 结果限制到明确选择的 `projectId`，记录本地审计摘要；不暴露绝对路径、命令全文、配置内容、秘密或终端输出。
- [ ] 明确拒绝 MCP run/cancel、文件写入、Shell、SSH 和 RDP 调用，并在能力结果中返回未来能力尚不可用的稳定错误码。
- [ ] 更新插件 README、MCP 合约与用户帮助文档。

**完成条件：** Codex 可安全理解和预览项目上下文，但无法跨越桌面端确认直接执行。

## Phase 6：验证、迁移发布与回归

- [ ] 使用隔离应用数据目录测试全新安装、旧项目历史迁移、升级、根目录失效、项目重定位和历史清理。
- [ ] 运行项目任务、工作流、配置编辑、云同步与 Automation MCP 的回归测试，确认旧行为未被替换为未验证的新路径。
- [ ] 执行 UTF-8 检查、前端单元测试/构建、Rust 单元测试和 `cargo check`。
- [ ] 执行 MCP stdio smoke：initialize、capabilities、项目列表、任务发现、引用预览、运行记录读取，以及对执行工具的拒绝。
- [ ] 做 macOS 与 Windows 手动验证：路径 canonicalize、Git 缺失、Shell provider 标签、重启中断状态和宠物摘要。
- [ ] 将每项复选框更新为可验证证据；未实现的远程、云端或 MCP 执行能力保持未勾选。

## 验证命令

```bash
pwsh -NoProfile -File scripts/check-utf8.ps1

cd app
npm test
npm run build

cd src-tauri
cargo test
cargo check

node ../mcp/devlauncher-automation-mcp.mjs --print-config
```

## 交付切片

| 切片 | 可交付价值 | 前置条件 |
| --- | --- | --- |
| A | 稳定本地项目档案与旧历史迁移 | Phase 1 |
| B | Runme + package scripts 的安全发现与预览 | A、Phase 2 |
| C | 可重新解析的项目任务工作流 | A、B、Phase 3 |
| D | 重启后可查看的项目运行中心 | C、Phase 4 |
| E | 安全的项目 MCP 读取与预览能力 | A-D、Phase 5 |
