# 实施计划

## 已完成

- [x] 调研 Runme CLI 与 Markdown 命名代码块契约。
- [x] 审计 DevLauncher builtin、终端、工作流和 capability 接入点。
- [x] 新增 Rust Runme Markdown 扫描器和任务命令校验。
- [x] 新增“项目任务” builtin 窗口与任务列表交互。
- [x] 接入终端执行和标准工作流保存。
- [x] 修复项目任务独立窗口与主窗口之间的工作流配置同步及绑定覆盖问题。
- [x] 注册 manifest、图标、Tauri window、native commands。
- [x] 使用 Runme `list --json` 发现显式命名任务，匿名代码块不进入任务列表，并保留本地解析回退。
- [x] 为扫描为空或结果不准确的情况提供上下文化 AI 文档重构提示词。
- [x] 编写需求、UX、模型、技术、安全、测试和决策文档。
- [x] 运行 Rust 单元测试、前端图标测试和生产构建。

## 后续迭代

- [ ] 保存项目 profile 和可迁移的项目引用，而不是只保存最近目录。
- [ ] 通过 Runme 的任务元数据支持参数输入、环境变量和依赖关系。
- [ ] 在列表中增加分类筛选、搜索和按文件分组。
- [ ] 研究跨平台 shell、WSL 路径转换和 PowerShell 执行适配。
- [ ] 增加直接绑定到键位的工作流选择器。
- [ ] 评估是否以插件方式接入 package scripts、Makefile、mise、go-task 等其他任务格式。
