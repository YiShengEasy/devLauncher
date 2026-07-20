# 项目任务发现与执行（Runme）

状态：MVP 已实现（2026-07-19）
负责人：DevLauncher 维护者
外部项目：[Runme CLI](https://github.com/runmedev/runme) · [官方 CLI 文档](https://docs.runme.dev/getting-started/cli/)

## 目标

把项目中分散在 README、开发手册和操作文档里的 Runme 代码块，发现为可搜索、可复核、可执行的项目任务，并允许将单个任务保存为 DevLauncher 工作流。

## 文档索引

- [需求](./01-requirements.md)
- [产品与交互设计](./02-product-ux.md)
- [领域模型](./03-domain-model.md)
- [技术设计](./04-technical-design.md)
- [集成契约](./05-integration-contract.md)
- [安全设计](./06-security.md)
- [实施计划](./07-implementation-plan.md)
- [测试计划](./08-test-plan.md)
- [决策记录](./09-decision-log.md)

## 已实现范围

- 以项目目录为边界扫描 .md 与 .markdown 文件。
- 优先调用 Runme `list --json`，只识别显式命名代码块，展示文件、行号、分类、风险和命令预览。
- Runme CLI 不可用时，回退到本地 Markdown 解析，仍可发现显式 `name` 代码块。
- 检测当前环境是否可调用 runme --version。
- 对任务文件、任务名和项目路径进行后端校验，生成 runme run 命令并复用 DevLauncher 终端。
- 将任务保存为普通 DevLauncher 工作流，后续可在工作流面板中配置条件、完成规则和键位绑定。
- 记住最近一次项目目录；不把项目目录写入 DevLauncher 配置文件。
- 扫描为空或结果不准确时，生成可复制的 AI 重构提示词，指导编码助手安全整理 README 或 TASKS.md。

## 使用方式

1. 安装 Runme CLI，并确保 runme 在 DevLauncher 启动环境的 PATH 中。
2. 在项目 Markdown 中使用命名代码块，例如：

~~~~markdown
~~~sh { name=test-project }
npm test
~~~
~~~~

3. 打开“项目任务”，选择项目目录并扫描。
4. 选中任务后可以复制命令、发送到终端执行，或保存为工作流。

## 当前限制

- 任务来源仍限定为显式命名的 Runme Markdown 代码块，不自动把 package.json、Makefile、Gradle 或匿名示例转成任务；AI 提示词可以指导编码助手核对这些来源后整理 TASKS.md。
- 首版只直接执行 shell 类代码块；PowerShell、Python、JSON 等代码块会展示但不能执行。
- 工作流保存的是经校验后的命令快照，尚未保存可跨机器迁移的项目引用。
- 未检测到 Runme 时可以继续浏览和保存任务，但执行按钮会被禁用。
- Windows 使用 Runme 时需遵循 Runme 官方对 WSL 和 shell 支持的说明。
