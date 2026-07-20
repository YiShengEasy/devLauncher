# 领域模型

## RunmeTask

~~~typescript
interface RunmeTask {
  id: string;
  name: string;
  file: string;       // 相对项目根目录
  line: number;       // 代码块首行
  language: string;
  command: string;
  category: "test" | "develop" | "release" | "ops" | string;
  risk: "safe" | "review" | "dangerous" | string;
  runnable: boolean;
}
~~~

## RunmeDiscovery

~~~typescript
interface RunmeDiscovery {
  root: string;
  projectName: string;
  runmeAvailable: boolean;
  runmeVersion?: string;
  scannedFiles: number;
  tasks: RunmeTask[];
  warnings: string[];
}
~~~

## 持久化策略

- 当前项目目录只保存在前端 localStorage 的 devlauncher.projecttasks.root 中。
- 发现结果不持久化；每次打开或重新扫描都从文件系统读取，避免 Markdown 修改后出现陈旧任务。
- 保存工作流使用现有 WorkflowDefinition 和 ScriptAction，不增加新的配置实体。
- 当前工作流保存命令快照，描述中记录项目名、相对文件和代码行号，便于追溯来源。
- 工作流保存后通过 projecttasks-workflow-saved 事件通知主窗口；主窗口绑定键位时重新读取最新配置，避免覆盖跨窗口新增的工作流。

## 不变量

- root 必须是存在的目录。
- file 必须是 root 内部的 .md 或 .markdown 文件。
- name 不得为空或包含控制字符。
- 执行前必须重新读取任务文件并确认同名任务仍存在。
- 单个 Markdown 文件不超过 1 MiB；单次扫描最多 512 个 Markdown 文件，递归深度最多 6 层。
