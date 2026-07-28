# 项目工作台（Project Workbench）

状态：规划中

开始：2026-07-28

功能标识：`project-workbench`

## 目标

将当前分散的“项目任务”“项目配置”“工作流运行”能力组织为一个本地优先的项目工作台：用户先选择并确认本机项目，再安全地发现可复用任务、查看关联配置与工作流，并在统一的运行中心追踪结果。

本功能吸收 OpenShip 的三项架构原则：多入口共用一个业务内核、平台差异经适配器隔离、每次执行保留可复核的快照。它**不**把 DevLauncher 扩展为云端 PaaS 或部署平台。

## 当前基础

- 项目任务：`app/src/builtins/projecttasks/`，目前以 Runme 命名 Markdown 任务为唯一任务来源。
- 项目配置：`app/src/builtins/projecttasks/ProjectConfigsPanel.tsx` 与
  `app/src-tauri/src/builtins/projectconfigs.rs`，支持本地配置发现、脱敏、校验与保存。
- 工作流：`app/src-tauri/src/workflow.rs`，支持条件、完成规则、取消和实时状态；运行状态当前只驻留在进程内存。
- Automation MCP：`plugins/devlauncher-automation/`，已支持配置预览、应用和键位绑定，但不执行工作流。

## 文档索引

- [需求说明](01-requirements.md)
- [实施计划](07-implementation-plan.md)

## 范围边界

- 本地项目路径、扫描结果和运行历史默认留在本机应用数据目录，不将绝对路径或命令输出加入云同步快照。
- 任务发现只产生候选项；执行继续要求用户在 DevLauncher UI 中确认。
- 远程项目、GitHub Webhook、自动部署、域名、TLS、数据库托管、云端团队协作均不属于本功能。
- MCP 第一阶段只读与预览；不新增从 Codex 直接执行 Shell、SSH 或远程桌面的能力。
