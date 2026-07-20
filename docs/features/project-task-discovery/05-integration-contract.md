# 集成契约

## Tauri commands

### discover_runme_tasks

请求：

~~~json
{ "root": "/path/to/project" }
~~~

响应：RunmeDiscovery，字段使用 camelCase。该命令只读本地文件，并调用 runme --version 和 runme list --json 做能力探测与显式任务发现。

### runme_task_command

请求：

~~~json
{
  "root": "/path/to/project",
  "file": "README.md",
  "name": "测试项目"
}
~~~

响应：经过路径和任务存在性校验的 shell 命令字符串。该命令不直接启动进程。

### toggle_projecttasks_window

无请求参数，显示或隐藏 projecttasks Tauri 窗口。

## Existing APIs reused

- terminal_run({ cmd })：把命令发送到已有终端窗口。
- loadConfig() / saveConfig()：读写工作流配置。
- createWorkflow() / createWorkflowStep()：生成标准工作流对象。

## Cross-window event

projecttasks-workflow-saved：项目任务窗口保存工作流后发送，payload 为 `{ workflowId }`。主窗口用它刷新工作流列表和可绑定数据。

## Markdown contract

统一格式：

~~~~markdown
~~~sh { name=test-project }
npm test
~~~
~~~~

name 使用项目内唯一的 kebab-case。没有 name 的代码块不会进入 DevLauncher 任务列表。扫描器只读取代码块，不修改原始 Markdown；需要整理时由用户复制 AI 重构提示词交给编码助手执行。

## 外部 Runme contract

DevLauncher 依赖 Runme CLI 的公开命令行行为：runme --version 和 runme run <name> --project <project> --filename <file>。具体平台 shell 能力和安装方式以 [Runme 官方 CLI 文档](https://docs.runme.dev/getting-started/cli/) 为准。
