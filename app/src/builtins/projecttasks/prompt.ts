export interface RunmeRefactorPromptContext {
  root: string;
  projectName: string;
  scannedFiles: number;
  taskCount: number;
}

export function buildRunmeRefactorPrompt(context: RunmeRefactorPromptContext): string {
  const root = context.root.trim() || "<项目根目录>";
  const projectName = context.projectName.trim() || "当前项目";

  return [
    "# 角色",
    "你是一名资深项目自动化与开发文档工程师。请直接检查并修改当前项目，使真实、常用的开发任务可以被 Runme 和 DevLauncher 准确发现。",
    "",
    "# 项目上下文",
    `- 项目名称：${projectName}`,
    `- 项目根目录：${root}`,
    `- DevLauncher 已扫描 Markdown 文件：${context.scannedFiles}`,
    `- 当前发现的显式任务：${context.taskCount}`,
    "",
    "# 目标",
    "1. 阅读 README、package.json、Makefile、脚本目录、容器配置、CI 配置和实际源码入口，确认项目真实存在的安装、启动、测试、检查、构建、发布、部署、迁移和维护命令。",
    "2. 优先在项目根目录创建或整理 TASKS.md，集中记录真实可执行任务；README 只保留简洁入口和指向 TASKS.md 的链接，除非现有 README 已经适合直接承载这些任务。",
    "3. 只给经过项目文件验证、可以从项目根目录执行的命令添加 Runme name。不要把输出日志、目录树、配置示例、API 示例或说明文字改成任务。",
    "",
    "# Runme 代码块规范",
    "- 使用 Shell fenced code block 和显式 name：",
    "~~~~markdown",
    "```sh { name=dev-start }",
    "./run-local.sh",
    "```",
    "~~~~",
    "- name 使用项目内唯一的 kebab-case：小写英文字母、数字和短横线，例如 deps-install、dev-start、test-backend、build-macos、release-github、deploy-ecs。",
    "- 名称尽量体现任务类型：setup/deps/install 表示环境，dev/start/serve 表示开发，test/lint/check 表示测试，build/package 表示构建，release/publish 表示发布，deploy 表示部署，database/migrate/backup 表示数据，其余维护任务使用 ops。",
    "- 不使用中文、空格、斜杠或依赖 Runme 自动生成的匿名名称。",
    "- 长期运行任务使用：interactive=true background=true closeTerminalOnSuccess=false。",
    "- 命令必须使用相对路径和项目自身的包管理器、缓存、脚本与配置；禁止写入开发者本机绝对路径。",
    "- 不是任务的示例使用 text、json、yaml 等准确语言，或者明确设置 ignore=true。",
    "",
    "# 持久化项目规则",
    "- 在项目根目录检查 AGENTS.md。如果不存在则创建；如果已存在则保留原有内容，只增量合并一个“Runme 任务维护规则”章节。",
    "- 该章节必须约束后续编码助手：每次新增或修改可执行脚本、package script、Makefile target、容器/部署/运维命令时，都要判断它是否是可重复的项目任务；如果是，必须在同一次改动中新增或更新 TASKS.md 中对应的显式 Runme name 代码块。",
    "- AGENTS.md 还必须说明：TASKS.md 只调用项目现有脚本或包命令，不复制实现；脚本被重命名、删除或参数变更时，必须同步修正任务入口并用 runme list 验证。",
    "- 将这些规则作为项目长期维护契约，不是本次整理完成后即失效的临时说明。",
    "",
    "# 改写边界",
    "- 保留 README 现有产品说明、架构说明、安装说明和对用户有价值的内容，不做无关重写。",
    "- 不新增一套与项目现有脚本重复的构建系统；优先调用已经存在的脚本、package scripts、Makefile target 或容器编排文件。",
    "- 不虚构不存在的命令、环境变量、服务、数据库或部署目标。",
    "- 不提交密码、Token、私钥、个人目录、代理地址或本机环境值；示例变量使用安全占位符。",
    "- 不执行发布、部署、数据库迁移、删除、清理或其他有副作用的命令。只允许执行只读检查，以及经确认安全的测试或构建验证。",
    "- 不提交 Git 代码，完成修改和验证后等待用户复核。",
    "",
    "# 验收",
    `1. 在 ${root} 执行：runme list --json --project ${JSON.stringify(root)}`,
    "2. 列表中只能出现显式命名、真实可执行的任务，不应出现目录结构、接口示例、日志或普通描述。",
    "3. 对每个任务核对来源文件和底层脚本，确认名称能够表达动作和范围。",
    "4. 确认 AGENTS.md 已包含持久的 Runme 任务维护规则，后续新增执行脚本时会同步维护 TASKS.md。",
    "5. 输出修改文件清单、任务名称清单、每个任务对应的真实命令，以及未执行的高风险验证项。",
  ].join("\n");
}
