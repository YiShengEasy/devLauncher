import type {
  CategoryId,
  CustomMemoryCategory,
  CustomMemoryItem,
  MemoryCategory,
  MemoryKind,
  MemoryItem,
  MergedQuickMemoryData,
  OrderState,
  QuickMemoryData,
} from "./model";

export interface CategoryDraft {
  name: string;
  subtitle: string;
  accent: string;
}

export interface ItemDraft {
  title: string;
  value: string;
  detail: string;
  kind: MemoryKind;
  tagsText: string;
}

export const BUILTIN_CATEGORIES: MemoryCategory[] = [
  { id: "linux", name: "Linux / Shell", subtitle: "文件、进程、网络、排障", accent: "#5eead4", source: "builtin" },
  { id: "git", name: "Git", subtitle: "分支、提交、回滚、协作", accent: "#f97316", source: "builtin" },
  { id: "vscode", name: "VS Code", subtitle: "导航、编辑、重构、终端", accent: "#38bdf8", source: "builtin" },
  { id: "docker", name: "Docker", subtitle: "容器、镜像、日志、清理", accent: "#60a5fa", source: "builtin" },
  { id: "node", name: "Node / Package", subtitle: "npm、pnpm、调试、依赖", accent: "#a3e635", source: "builtin" },
];

export const BUILTIN_MEMORY_ITEMS: MemoryItem[] = [
  {
    id: "linux-ls",
    category: "linux",
    title: "查看目录详情",
    value: "ls -lah",
    detail: "显示隐藏文件、权限、大小和修改时间，排查路径内容最常用。",
    kind: "command",
    tags: ["file", "inspect"],
    priority: true,
    source: "builtin",
  },
  {
    id: "linux-find-name",
    category: "linux",
    title: "按文件名搜索",
    value: "find . -name \"*.log\" -type f",
    detail: "从当前目录递归查找指定模式文件，适合没有 rg/fd 的环境。",
    kind: "command",
    tags: ["file", "search"],
    source: "builtin",
  },
  {
    id: "linux-grep",
    category: "linux",
    title: "文本检索",
    value: "grep -R \"TODO\" .",
    detail: "递归搜索文本；大仓库优先用 rg，这条用于基础环境兜底。",
    kind: "command",
    tags: ["search", "text"],
    source: "builtin",
  },
  {
    id: "linux-ps",
    category: "linux",
    title: "查进程",
    value: "ps aux | grep node",
    detail: "确认服务是否仍在运行，定位 PID 后可结合 kill 使用。",
    kind: "command",
    tags: ["process"],
    priority: true,
    source: "builtin",
  },
  {
    id: "linux-ports",
    category: "linux",
    title: "查看端口占用",
    value: "lsof -i :3000",
    detail: "确认本地端口被哪个进程占用，开发服务器冲突时高频使用。",
    kind: "command",
    tags: ["network", "process"],
    source: "builtin",
  },
  {
    id: "linux-tail",
    category: "linux",
    title: "实时看日志",
    value: "tail -f app.log",
    detail: "跟随日志输出，适合观察请求、错误和后台任务。",
    kind: "command",
    tags: ["log"],
    source: "builtin",
  },
  {
    id: "git-status",
    category: "git",
    title: "查看工作区状态",
    value: "git status --short",
    detail: "用紧凑格式确认修改、暂存和未跟踪文件。",
    kind: "command",
    tags: ["status"],
    priority: true,
    source: "builtin",
  },
  {
    id: "git-diff",
    category: "git",
    title: "查看未暂存改动",
    value: "git diff",
    detail: "提交前检查实际代码差异，避免把临时调试改动带进去。",
    kind: "command",
    tags: ["review"],
    source: "builtin",
  },
  {
    id: "git-log",
    category: "git",
    title: "查看提交线",
    value: "git log --oneline --graph --decorate -n 20",
    detail: "快速理解分支历史和最近提交关系。",
    kind: "command",
    tags: ["history"],
    source: "builtin",
  },
  {
    id: "git-switch",
    category: "git",
    title: "创建并切换分支",
    value: "git switch -c feature/name",
    detail: "从当前 HEAD 创建新分支并进入工作。",
    kind: "command",
    tags: ["branch"],
    source: "builtin",
  },
  {
    id: "git-restore",
    category: "git",
    title: "撤销单个文件改动",
    value: "git restore path/to/file",
    detail: "只回退指定文件的未暂存改动，使用前先确认 diff。",
    kind: "command",
    tags: ["restore"],
    source: "builtin",
  },
  {
    id: "git-stash",
    category: "git",
    title: "临时保存现场",
    value: "git stash push -m \"wip\"",
    detail: "切分支或拉取前临时收起未完成改动。",
    kind: "command",
    tags: ["wip"],
    source: "builtin",
  },
  {
    id: "vscode-command-palette",
    category: "vscode",
    title: "命令面板",
    value: "Ctrl+Shift+P",
    detail: "执行所有 VS Code 命令，找不到入口时先用它。",
    kind: "shortcut",
    tags: ["navigate"],
    priority: true,
    source: "builtin",
  },
  {
    id: "vscode-file",
    category: "vscode",
    title: "快速打开文件",
    value: "Ctrl+P",
    detail: "按文件名跳转，是大项目里最高频的导航快捷键。",
    kind: "shortcut",
    tags: ["navigate"],
    priority: true,
    source: "builtin",
  },
  {
    id: "vscode-symbol",
    category: "vscode",
    title: "文件内符号跳转",
    value: "Ctrl+Shift+O",
    detail: "在当前文件内跳转函数、类、常量。",
    kind: "shortcut",
    tags: ["navigate"],
    source: "builtin",
  },
  {
    id: "vscode-terminal",
    category: "vscode",
    title: "切换终端",
    value: "Ctrl+`",
    detail: "打开或隐藏集成终端，适合边改边跑命令。",
    kind: "shortcut",
    tags: ["terminal"],
    source: "builtin",
  },
  {
    id: "vscode-rename",
    category: "vscode",
    title: "重命名符号",
    value: "F2",
    detail: "基于语言服务安全重命名变量、函数和类型。",
    kind: "shortcut",
    tags: ["refactor"],
    source: "builtin",
  },
  {
    id: "vscode-multi-cursor",
    category: "vscode",
    title: "选择下一个匹配项",
    value: "Ctrl+D",
    detail: "逐个选择相同文本，多光标编辑小范围重复内容。",
    kind: "shortcut",
    tags: ["edit"],
    source: "builtin",
  },
  {
    id: "docker-ps",
    category: "docker",
    title: "查看运行容器",
    value: "docker ps",
    detail: "确认容器、端口映射、状态和名称。",
    kind: "command",
    tags: ["container"],
    priority: true,
    source: "builtin",
  },
  {
    id: "docker-logs",
    category: "docker",
    title: "跟随容器日志",
    value: "docker logs -f container_name",
    detail: "排查服务启动失败、请求错误和后台任务。",
    kind: "command",
    tags: ["log"],
    source: "builtin",
  },
  {
    id: "docker-exec",
    category: "docker",
    title: "进入容器 Shell",
    value: "docker exec -it container_name sh",
    detail: "进入容器内部检查文件、环境变量和网络。",
    kind: "command",
    tags: ["debug"],
    source: "builtin",
  },
  {
    id: "docker-compose",
    category: "docker",
    title: "启动 Compose 服务",
    value: "docker compose up -d",
    detail: "后台启动 compose.yml 中定义的开发依赖。",
    kind: "command",
    tags: ["compose"],
    priority: true,
    source: "builtin",
  },
  {
    id: "docker-prune",
    category: "docker",
    title: "清理未使用资源",
    value: "docker system prune",
    detail: "释放磁盘前先确认不会删除仍需要的缓存和停止容器。",
    kind: "command",
    tags: ["clean"],
    source: "builtin",
  },
  {
    id: "node-install",
    category: "node",
    title: "安装依赖",
    value: "npm install",
    detail: "根据 package.json / lockfile 安装当前项目依赖。",
    kind: "command",
    tags: ["deps"],
    priority: true,
    source: "builtin",
  },
  {
    id: "node-run",
    category: "node",
    title: "查看可运行脚本",
    value: "npm run",
    detail: "列出 package.json scripts，接手项目时先看这里。",
    kind: "command",
    tags: ["scripts"],
    source: "builtin",
  },
  {
    id: "node-dev",
    category: "node",
    title: "启动开发服务",
    value: "npm run dev",
    detail: "大多数 Vite/Next/前端项目的本地开发入口。",
    kind: "command",
    tags: ["dev"],
    priority: true,
    source: "builtin",
  },
  {
    id: "node-outdated",
    category: "node",
    title: "检查过期依赖",
    value: "npm outdated",
    detail: "查看 current、wanted、latest 三列，判断升级范围。",
    kind: "command",
    tags: ["deps"],
    source: "builtin",
  },
  {
    id: "node-why",
    category: "node",
    title: "定位依赖来源",
    value: "npm explain package-name",
    detail: "查某个包为什么会出现在依赖树中。",
    kind: "command",
    tags: ["deps", "debug"],
    source: "builtin",
  },
  {
    id: "linux-pwd",
    category: "linux",
    title: "显示当前目录",
    value: "pwd",
    detail: "确认自己现在在哪个路径，执行删除、移动、构建命令前先看一眼。",
    kind: "command",
    tags: ["path", "beginner"],
    priority: true,
    source: "builtin",
  },
  {
    id: "linux-cd-home",
    category: "linux",
    title: "回到用户目录",
    value: "cd ~",
    detail: "快速回到当前用户的 home 目录，适合从很深的路径退出来。",
    kind: "command",
    tags: ["path", "beginner"],
    source: "builtin",
  },
  {
    id: "linux-mkdir",
    category: "linux",
    title: "创建多级目录",
    value: "mkdir -p logs/app",
    detail: "-p 会自动创建不存在的上级目录，目录已存在也不会报错。",
    kind: "command",
    tags: ["file", "directory"],
    source: "builtin",
  },
  {
    id: "linux-cp-dir",
    category: "linux",
    title: "复制目录",
    value: "cp -r source_dir target_dir",
    detail: "递归复制目录及其内容，复制前确认目标路径。",
    kind: "command",
    tags: ["file", "copy"],
    source: "builtin",
  },
  {
    id: "linux-mv",
    category: "linux",
    title: "移动或重命名",
    value: "mv old_name new_name",
    detail: "同目录下是重命名，不同目录下是移动。",
    kind: "command",
    tags: ["file", "rename"],
    source: "builtin",
  },
  {
    id: "linux-rm-safe",
    category: "linux",
    title: "删除文件",
    value: "rm file.txt",
    detail: "删除不可恢复，递归删除目录前先用 ls 确认路径。",
    kind: "command",
    tags: ["file", "delete"],
    source: "builtin",
  },
  {
    id: "linux-du",
    category: "linux",
    title: "查看目录大小",
    value: "du -sh *",
    detail: "查看当前目录下各项占用，排查磁盘空间最常用。",
    kind: "command",
    tags: ["disk"],
    source: "builtin",
  },
  {
    id: "linux-df",
    category: "linux",
    title: "查看磁盘空间",
    value: "df -h",
    detail: "显示各分区剩余空间，服务器构建失败时常用。",
    kind: "command",
    tags: ["disk"],
    source: "builtin",
  },
  {
    id: "linux-chmod",
    category: "linux",
    title: "增加执行权限",
    value: "chmod +x script.sh",
    detail: "脚本提示 permission denied 时，常需要先加执行权限。",
    kind: "command",
    tags: ["permission"],
    source: "builtin",
  },
  {
    id: "linux-curl-head",
    category: "linux",
    title: "检查 URL 响应头",
    value: "curl -I https://example.com",
    detail: "快速看 HTTP 状态码、重定向和缓存头。",
    kind: "command",
    tags: ["network", "http"],
    source: "builtin",
  },
  {
    id: "linux-tar",
    category: "linux",
    title: "解压 tar.gz",
    value: "tar -xzvf archive.tar.gz",
    detail: "解压常见 Linux 压缩包，x 解包、z gzip、v 显示过程、f 指定文件。",
    kind: "command",
    tags: ["archive"],
    source: "builtin",
  },
  {
    id: "git-add-patch",
    category: "git",
    title: "交互式暂存部分改动",
    value: "git add -p",
    detail: "把同一文件里的改动拆开暂存，适合提交保持干净。",
    kind: "command",
    tags: ["stage", "review"],
    source: "builtin",
  },
  {
    id: "git-commit",
    category: "git",
    title: "提交改动",
    value: "git commit -m \"message\"",
    detail: "把已暂存内容生成提交；message 写清楚为什么改。",
    kind: "command",
    tags: ["commit"],
    priority: true,
    source: "builtin",
  },
  {
    id: "git-pull-rebase",
    category: "git",
    title: "拉取并变基",
    value: "git pull --rebase",
    detail: "更新当前分支并尽量保持提交历史线性。",
    kind: "command",
    tags: ["sync"],
    source: "builtin",
  },
  {
    id: "git-fetch",
    category: "git",
    title: "获取远端更新",
    value: "git fetch --all --prune",
    detail: "同步远端分支信息并清理已删除的远端引用。",
    kind: "command",
    tags: ["sync", "remote"],
    source: "builtin",
  },
  {
    id: "git-branch",
    category: "git",
    title: "查看分支",
    value: "git branch -vv",
    detail: "查看本地分支、上游分支和领先/落后状态。",
    kind: "command",
    tags: ["branch"],
    source: "builtin",
  },
  {
    id: "git-show",
    category: "git",
    title: "查看某次提交",
    value: "git show --stat HEAD",
    detail: "快速看最近提交改了哪些文件和摘要。",
    kind: "command",
    tags: ["history"],
    source: "builtin",
  },
  {
    id: "git-blame",
    category: "git",
    title: "查看每行来源",
    value: "git blame path/to/file",
    detail: "定位某行是谁在什么时候改的，用于理解历史背景。",
    kind: "command",
    tags: ["history", "debug"],
    source: "builtin",
  },
  {
    id: "git-cherry-pick",
    category: "git",
    title: "摘取提交",
    value: "git cherry-pick <commit>",
    detail: "把另一个分支上的某个提交应用到当前分支。",
    kind: "command",
    tags: ["branch"],
    source: "builtin",
  },
  {
    id: "vscode-go-definition",
    category: "vscode",
    title: "跳转到定义",
    value: "F12",
    detail: "跳到函数、类型、变量的定义位置。",
    kind: "shortcut",
    tags: ["navigate"],
    priority: true,
    source: "builtin",
  },
  {
    id: "vscode-peek-definition",
    category: "vscode",
    title: "预览定义",
    value: "Alt+F12",
    detail: "在当前文件内弹出定义预览，不打断上下文。",
    kind: "shortcut",
    tags: ["navigate"],
    source: "builtin",
  },
  {
    id: "vscode-find-file",
    category: "vscode",
    title: "文件内搜索",
    value: "Ctrl+F",
    detail: "在当前文件查找文本。",
    kind: "shortcut",
    tags: ["search"],
    source: "builtin",
  },
  {
    id: "vscode-find-workspace",
    category: "vscode",
    title: "全局搜索",
    value: "Ctrl+Shift+F",
    detail: "在整个工作区搜索文本，理解代码调用关系时高频使用。",
    kind: "shortcut",
    tags: ["search"],
    priority: true,
    source: "builtin",
  },
  {
    id: "vscode-format",
    category: "vscode",
    title: "格式化当前文件",
    value: "Shift+Alt+F",
    detail: "用配置好的 formatter 格式化当前文件。",
    kind: "shortcut",
    tags: ["format"],
    source: "builtin",
  },
  {
    id: "vscode-comment",
    category: "vscode",
    title: "切换行注释",
    value: "Ctrl+/",
    detail: "快速注释或取消注释当前行/选中区域。",
    kind: "shortcut",
    tags: ["edit"],
    source: "builtin",
  },
  {
    id: "vscode-debug",
    category: "vscode",
    title: "开始调试",
    value: "F5",
    detail: "按当前 launch 配置启动调试。",
    kind: "shortcut",
    tags: ["debug"],
    source: "builtin",
  },
  {
    id: "vscode-sidebar",
    category: "vscode",
    title: "切换侧边栏",
    value: "Ctrl+B",
    detail: "隐藏或显示左侧栏，给编辑器更多空间。",
    kind: "shortcut",
    tags: ["layout"],
    source: "builtin",
  },
  {
    id: "docker-images",
    category: "docker",
    title: "查看镜像",
    value: "docker images",
    detail: "列出本地镜像、标签和大小。",
    kind: "command",
    tags: ["image"],
    source: "builtin",
  },
  {
    id: "docker-stop",
    category: "docker",
    title: "停止容器",
    value: "docker stop container_name",
    detail: "优雅停止正在运行的容器。",
    kind: "command",
    tags: ["container"],
    source: "builtin",
  },
  {
    id: "docker-rm",
    category: "docker",
    title: "删除已停止容器",
    value: "docker rm container_name",
    detail: "删除不再需要的停止容器，不会删除镜像。",
    kind: "command",
    tags: ["container", "clean"],
    source: "builtin",
  },
  {
    id: "docker-build",
    category: "docker",
    title: "构建镜像",
    value: "docker build -t app:dev .",
    detail: "基于当前目录 Dockerfile 构建镜像并打标签。",
    kind: "command",
    tags: ["image", "build"],
    source: "builtin",
  },
  {
    id: "docker-pull",
    category: "docker",
    title: "拉取镜像",
    value: "docker pull postgres:16",
    detail: "从镜像仓库下载指定版本镜像。",
    kind: "command",
    tags: ["image"],
    source: "builtin",
  },
  {
    id: "docker-compose-down",
    category: "docker",
    title: "停止 Compose 服务",
    value: "docker compose down",
    detail: "停止并移除 compose 创建的容器和默认网络。",
    kind: "command",
    tags: ["compose"],
    source: "builtin",
  },
  {
    id: "docker-compose-logs",
    category: "docker",
    title: "查看 Compose 日志",
    value: "docker compose logs -f service_name",
    detail: "跟随某个 compose 服务日志。",
    kind: "command",
    tags: ["compose", "log"],
    source: "builtin",
  },
  {
    id: "docker-stats",
    category: "docker",
    title: "查看容器资源",
    value: "docker stats",
    detail: "实时查看容器 CPU、内存、网络和磁盘 IO。",
    kind: "command",
    tags: ["monitor"],
    source: "builtin",
  },
  {
    id: "node-ci",
    category: "node",
    title: "按 lockfile 干净安装",
    value: "npm ci",
    detail: "CI 或干净环境中按 lockfile 精确安装依赖。",
    kind: "command",
    tags: ["deps", "ci"],
    source: "builtin",
  },
  {
    id: "node-test",
    category: "node",
    title: "运行测试脚本",
    value: "npm test",
    detail: "执行 package.json 中的 test 脚本。",
    kind: "command",
    tags: ["test"],
    priority: true,
    source: "builtin",
  },
  {
    id: "node-build",
    category: "node",
    title: "运行构建脚本",
    value: "npm run build",
    detail: "构建生产包，也是提交前常用验证命令。",
    kind: "command",
    tags: ["build"],
    priority: true,
    source: "builtin",
  },
  {
    id: "node-lint",
    category: "node",
    title: "运行 lint",
    value: "npm run lint",
    detail: "检查代码风格和常见错误，具体规则由项目配置决定。",
    kind: "command",
    tags: ["lint"],
    source: "builtin",
  },
  {
    id: "node-pnpm-install",
    category: "node",
    title: "pnpm 安装依赖",
    value: "pnpm install",
    detail: "使用 pnpm 根据 lockfile 安装依赖。",
    kind: "command",
    tags: ["deps", "pnpm"],
    source: "builtin",
  },
  {
    id: "node-pnpm-dev",
    category: "node",
    title: "pnpm 启动开发服务",
    value: "pnpm dev",
    detail: "很多 pnpm 项目的本地开发入口。",
    kind: "command",
    tags: ["dev", "pnpm"],
    source: "builtin",
  },
  {
    id: "node-cache",
    category: "node",
    title: "清理 npm 缓存",
    value: "npm cache verify",
    detail: "检查并修复 npm 缓存，安装异常时可先尝试。",
    kind: "command",
    tags: ["cache", "deps"],
    source: "builtin",
  },
  {
    id: "node-npx",
    category: "node",
    title: "临时运行包命令",
    value: "npx package-name",
    detail: "不全局安装也能执行包提供的 CLI。",
    kind: "command",
    tags: ["cli"],
    source: "builtin",
  },
];

export function toCustomCategory(category: MemoryCategory): CustomMemoryCategory {
  const now = new Date().toISOString();
  return {
    id: category.id,
    name: category.name.trim(),
    subtitle: category.subtitle.trim(),
    accent: category.accent,
    createdAt: category.createdAt ?? now,
    updatedAt: now,
  };
}

export function toCustomItem(item: MemoryItem): CustomMemoryItem {
  const now = new Date().toISOString();
  return {
    id: item.id,
    category: item.category,
    title: item.title.trim(),
    value: item.value.trim(),
    detail: item.detail.trim(),
    kind: item.kind,
    tags: normalizeTags(item.tags),
    priority: Boolean(item.priority),
    createdAt: item.createdAt ?? now,
    updatedAt: now,
  };
}

export function mergeQuickMemoryData(data: QuickMemoryData): MergedQuickMemoryData {
  const customCategories: MemoryCategory[] = data.customCategories.map((category) => ({
    ...category,
    source: "custom",
  }));
  const categoryIds = new Set([...BUILTIN_CATEGORIES, ...customCategories].map((category) => category.id));
  const customItems: MemoryItem[] = data.customItems
    .filter((item) => categoryIds.has(item.category))
    .map((item) => ({
      ...item,
      source: "custom",
    }));

  return {
    categories: [...BUILTIN_CATEGORIES, ...customCategories],
    items: [...BUILTIN_MEMORY_ITEMS, ...customItems],
    order: data.order ?? {},
    copyCounts: data.copyCounts ?? {},
  };
}

export function getOrderedCategoryItems(
  category: CategoryId,
  items: MemoryItem[],
  orderState: OrderState
): MemoryItem[] {
  const baseItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.category === category)
    .sort((a, b) => {
      const priorityDiff = Number(Boolean(b.item.priority)) - Number(Boolean(a.item.priority));
      if (priorityDiff !== 0) return priorityDiff;
      return a.index - b.index;
    })
    .map(({ item }) => item);
  const validIds = new Set(baseItems.map((item) => item.id));
  const savedOrder = (orderState[category] ?? []).filter((id) => validIds.has(id));
  if (savedOrder.length === 0) return baseItems;

  const byId = new Map(baseItems.map((item) => [item.id, item]));
  const ordered = savedOrder.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const missing = baseItems.filter((item) => !savedOrder.includes(item.id));
  return [...ordered, ...missing];
}

export function filterMemoryItems(items: MemoryItem[], query: string): MemoryItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => {
    const haystack = [
      item.title,
      item.value,
      item.detail,
      item.kind,
      ...item.tags,
    ].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

export function parseTags(input: string): string[] {
  return normalizeTags(input.split(/[,\s]+/));
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export function createQuickMemoryId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function validateCategoryDraft(draft: CategoryDraft): string | null {
  if (!draft.name.trim()) return "类别名称不能为空";
  if (!draft.accent.trim()) return "强调色不能为空";
  return null;
}

export function validateItemDraft(draft: ItemDraft): string | null {
  if (!draft.title.trim()) return "标题不能为空";
  if (!draft.value.trim()) return "内容不能为空";
  return null;
}

export function deleteCustomCategory(data: QuickMemoryData, categoryId: string): QuickMemoryData {
  const itemIds = new Set(data.customItems.filter((item) => item.category === categoryId).map((item) => item.id));
  const copyCounts = { ...data.copyCounts };
  for (const id of itemIds) {
    delete copyCounts[id];
  }
  const order = Object.fromEntries(
    Object.entries(data.order)
      .filter(([key]) => key !== categoryId)
      .map(([key, ids]) => [key, ids.filter((id) => !itemIds.has(id))])
  );
  return {
    ...data,
    customCategories: data.customCategories.filter((category) => category.id !== categoryId),
    customItems: data.customItems.filter((item) => item.category !== categoryId),
    order,
    copyCounts,
  };
}

export function deleteCustomItem(data: QuickMemoryData, itemId: string): QuickMemoryData {
  const copyCounts = { ...data.copyCounts };
  delete copyCounts[itemId];
  return {
    ...data,
    customItems: data.customItems.filter((item) => item.id !== itemId),
    order: Object.fromEntries(
      Object.entries(data.order).map(([category, ids]) => [category, ids.filter((id) => id !== itemId)])
    ),
    copyCounts,
  };
}
