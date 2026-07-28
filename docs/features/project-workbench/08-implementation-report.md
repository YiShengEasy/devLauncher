# 实施报告

日期：2026-07-28

状态：核心切片 A-E 已实现，跨平台人工验收与扩展 provider 保留为后续工作。

## 已交付

- 版本化本机项目档案：稳定项目 ID、旧历史迁移、24 项上限、缺失目录状态、重新定位、删除、Git 分支与仓库提示。
- 本机数据边界：项目根目录、任务记录和运行历史不再上传或从云快照恢复。
- 声明式任务发现：保留 Runme 显式命名任务，并新增只解析、不执行的 `package.json scripts` provider。
- 引用型工作流：`project_task` Action 只保存 `projectId/provider/sourceKey/file/taskName`；每次运行都由 Rust 重新验证并生成命令。
- 持久运行历史：版本化 JSON、原子替换、500 条上限、重启中断恢复、手动清理，并移除命令输出、终端会话和绝对路径。
- 项目运行中心：按当前项目/全部、状态筛选，查看步骤摘要、复制脱敏摘要、取消活动运行。
- 最小宠物事件：只发送运行 ID、项目 ID、工作流名和状态。
- Automation MCP 只读面：项目列表、项目任务、引用预览、脱敏运行历史；无项目执行、取消、Shell、SSH、RDP 或项目文件写入工具。
- MCP 本地审计：记录工具名、项目 ID（可用时）、时间、只读风险级别和结果码，不记录路径、命令或输出。

## 数据与安全约束

- `projecttasks_data.json` 与 `workflow_run_history.json` 只属于当前设备。
- `keyboard.yaml` 中的项目任务步骤不包含项目绝对路径或命令快照。
- 前端发现结果不是执行授权；直接执行和工作流执行都会回到 Rust provider 验证。
- MCP 任务列表不返回项目根目录或完整命令；引用预览只返回能否解析。

## 自动验证证据

```text
npm test -- --run
29 files, 126 tests passed

npm run build
TypeScript and Vite production build passed

cargo test --lib
77 tests passed

cargo build --bin devlauncherctl
passed

node scripts/test-automation-mcp.mjs
initialize, tools/list, workflow preview, project list, run history,
and unsupported execution rejection passed
```

## 保留项

- Makefile、Taskfile、CI 等 provider 在有明确定位规则后再接入。
- 旧 `ScriptAction` 到项目任务引用的自动转换向导尚未提供；旧工作流保持原样。
- Windows 真机上的目录移动、原子替换与 Shell 标签仍需发布前人工验收。
- 运行中心尚未提供独立的工作流列表区域；工作流编辑继续复用现有工作流窗口。
- MCP 执行与取消能力保持关闭，除非后续完成桌面逐次确认与 capability 安全评审。
