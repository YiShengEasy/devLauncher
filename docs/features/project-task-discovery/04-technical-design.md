# 技术设计

## 组件边界

~~~mermaid
flowchart TB
  UI[ProjectTasksApp]
  DISC[discover_runme_tasks]
  CMD[runme_task_command]
  TERM[terminal_run / Terminal PTY]
  WF[Workflow API + config]
  FS[本地 Markdown]
  CLI[Runme CLI]

  UI --> DISC
  UI --> CMD
  UI --> TERM
  UI --> WF
  DISC --> FS
  DISC --> CLI
  CMD --> FS
  TERM --> CLI
~~~

## 后端扫描器

位置：app/src-tauri/src/builtins/projecttasks.rs

- 优先调用 `runme list --json --project <root>`，只使用 Runme 的显式任务名称和文件列表。
- 读取对应 Markdown 文件，解析三反引号或三波浪线 fenced block，以补充代码行号、语言和完整命令预览。
- Runme CLI 不可用或列表命令失败时，回退到本地解析，并支持 name=value、name="value" 和 name: "value"。
- 对 shell、bash、zsh、command、console 标记为首版可执行语言。
- 优先根据规范化任务名、其次根据命令关键词推导环境、开发、测试、构建、发布、部署、数据和运维分类；分类仅用于分组筛选。
- 在扫描时执行 runme --version 和只读的 runme list，不执行项目任务。
- Tauri command 使用 spawn_blocking 把文件遍历和 Runme 子进程移出异步命令线程，避免扫描阻塞窗口交互。

## AI 文档重构提示词

提示词模板位于 app/src/builtins/projecttasks/prompt.ts，由项目路径、项目名、已扫描文件数和已发现任务数生成。扫描为空时默认展开；扫描有结果时保留“结果不准确”入口。

提示词要求 AI 先从现有 package scripts、Makefile、脚本、容器和 CI 配置核对真实命令，再集中整理 TASKS.md 或 README。同时必须创建或增量合并项目根目录的 `AGENTS.md`，持久约束后续编码助手在新增或修改执行脚本时，于同一次改动中同步新增或更新 `TASKS.md` 的显式 Runme 任务。它禁止虚构命令、写入本机绝对路径或秘密，也禁止执行发布、部署、迁移、删除和 Git 提交。

## 扫描项目历史

前端使用 localStorage 的 `devlauncher.projecttasks.projects` 保存最多 24 个项目索引，字段仅包含项目根路径、显示名、任务数、扫描文件数和最后扫描时间。旧的 `devlauncher.projecttasks.root` 会迁移为第一条历史记录。

历史记录不保存命令内容，不进入 DevLauncher 同步配置。完整发现结果只缓存在当前窗口内存中：访问过的项目可立即切换，刷新时再调用 discover_runme_tasks。前端为每次扫描分配递增序号，只允许最后一次请求更新当前界面，较早结果仅补充会话缓存。

## 执行链路

1. 前端请求 runme_task_command。
2. Rust canonicalize 项目目录和任务文件，验证路径前缀、扩展名和任务名称。
3. Rust 重新解析目标文件，确认任务仍存在。
4. Rust 返回带安全 shell quoting 的命令：

~~~text
cd '<project>' && runme run '<name>' --project '<project>' --filename '<file>'
~~~

5. 前端调用既有 terminal_run，由内置终端负责 PTY、输出、输入和退出显示。

## 工作流链路

保存时把校验后的命令作为 ScriptAction(shell: terminal)，通过既有 createWorkflowStep 和 saveConfig 写入配置。这样任务天然获得工作流已有的完成规则、条件、失败策略和键位绑定能力。

项目任务窗口保存成功后发送 projecttasks-workflow-saved 事件。主窗口收到事件会刷新内存配置；绑定键位时还会基于磁盘最新配置合并单个键位变更，避免多窗口写回旧配置。

## 窗口接入

- manifest：app/src/builtins/projecttasks/manifest.ts
- 注册：app/src/builtins/_registry.ts、app/src/types/actions.ts
- 图标：app/src/icons/builtinIcons.tsx、palette.ts
- Tauri window：app/src-tauri/tauri.conf.json
- capability：app/src-tauri/capabilities/default.json
- native command：app/src-tauri/src/lib.rs

## 故障处理

- 扫描失败：页面展示错误和空状态。
- Runme 缺失：展示任务但禁用执行。
- 文件发生变化：执行前重新验证，失败则要求重新扫描。
- 终端异常：沿用现有终端错误输出，不另建后台进程。
