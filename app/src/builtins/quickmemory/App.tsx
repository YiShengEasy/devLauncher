import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyThemeFromConfig } from "@/api/theme";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";

type MemoryKind = "command" | "shortcut";

interface MemoryItem {
  id: string;
  category: CategoryId;
  title: string;
  value: string;
  detail: string;
  kind: MemoryKind;
  tags: string[];
  priority?: boolean;
}

type CategoryId = "linux" | "git" | "vscode" | "docker" | "node";

const CATEGORIES: { id: CategoryId; name: string; subtitle: string; accent: string }[] = [
  { id: "linux", name: "Linux / Shell", subtitle: "文件、进程、网络、排障", accent: "#5eead4" },
  { id: "git", name: "Git", subtitle: "分支、提交、回滚、协作", accent: "#f97316" },
  { id: "vscode", name: "VS Code", subtitle: "导航、编辑、重构、终端", accent: "#38bdf8" },
  { id: "docker", name: "Docker", subtitle: "容器、镜像、日志、清理", accent: "#60a5fa" },
  { id: "node", name: "Node / Package", subtitle: "npm、pnpm、调试、依赖", accent: "#a3e635" },
];

const MEMORY_ITEMS: MemoryItem[] = [
  {
    id: "linux-ls",
    category: "linux",
    title: "查看目录详情",
    value: "ls -lah",
    detail: "显示隐藏文件、权限、大小和修改时间，排查路径内容最常用。",
    kind: "command",
    tags: ["file", "inspect"],
    priority: true,
  },
  {
    id: "linux-find-name",
    category: "linux",
    title: "按文件名搜索",
    value: "find . -name \"*.log\" -type f",
    detail: "从当前目录递归查找指定模式文件，适合没有 rg/fd 的环境。",
    kind: "command",
    tags: ["file", "search"],
  },
  {
    id: "linux-grep",
    category: "linux",
    title: "文本检索",
    value: "grep -R \"TODO\" .",
    detail: "递归搜索文本；大仓库优先用 rg，这条用于基础环境兜底。",
    kind: "command",
    tags: ["search", "text"],
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
  },
  {
    id: "linux-ports",
    category: "linux",
    title: "查看端口占用",
    value: "lsof -i :3000",
    detail: "确认本地端口被哪个进程占用，开发服务器冲突时高频使用。",
    kind: "command",
    tags: ["network", "process"],
  },
  {
    id: "linux-tail",
    category: "linux",
    title: "实时看日志",
    value: "tail -f app.log",
    detail: "跟随日志输出，适合观察请求、错误和后台任务。",
    kind: "command",
    tags: ["log"],
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
  },
  {
    id: "git-diff",
    category: "git",
    title: "查看未暂存改动",
    value: "git diff",
    detail: "提交前检查实际代码差异，避免把临时调试改动带进去。",
    kind: "command",
    tags: ["review"],
  },
  {
    id: "git-log",
    category: "git",
    title: "查看提交线",
    value: "git log --oneline --graph --decorate -n 20",
    detail: "快速理解分支历史和最近提交关系。",
    kind: "command",
    tags: ["history"],
  },
  {
    id: "git-switch",
    category: "git",
    title: "创建并切换分支",
    value: "git switch -c feature/name",
    detail: "从当前 HEAD 创建新分支并进入工作。",
    kind: "command",
    tags: ["branch"],
  },
  {
    id: "git-restore",
    category: "git",
    title: "撤销单个文件改动",
    value: "git restore path/to/file",
    detail: "只回退指定文件的未暂存改动，使用前先确认 diff。",
    kind: "command",
    tags: ["restore"],
  },
  {
    id: "git-stash",
    category: "git",
    title: "临时保存现场",
    value: "git stash push -m \"wip\"",
    detail: "切分支或拉取前临时收起未完成改动。",
    kind: "command",
    tags: ["wip"],
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
  },
  {
    id: "vscode-symbol",
    category: "vscode",
    title: "文件内符号跳转",
    value: "Ctrl+Shift+O",
    detail: "在当前文件内跳转函数、类、常量。",
    kind: "shortcut",
    tags: ["navigate"],
  },
  {
    id: "vscode-terminal",
    category: "vscode",
    title: "切换终端",
    value: "Ctrl+`",
    detail: "打开或隐藏集成终端，适合边改边跑命令。",
    kind: "shortcut",
    tags: ["terminal"],
  },
  {
    id: "vscode-rename",
    category: "vscode",
    title: "重命名符号",
    value: "F2",
    detail: "基于语言服务安全重命名变量、函数和类型。",
    kind: "shortcut",
    tags: ["refactor"],
  },
  {
    id: "vscode-multi-cursor",
    category: "vscode",
    title: "选择下一个匹配项",
    value: "Ctrl+D",
    detail: "逐个选择相同文本，多光标编辑小范围重复内容。",
    kind: "shortcut",
    tags: ["edit"],
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
  },
  {
    id: "docker-logs",
    category: "docker",
    title: "跟随容器日志",
    value: "docker logs -f container_name",
    detail: "排查服务启动失败、请求错误和后台任务。",
    kind: "command",
    tags: ["log"],
  },
  {
    id: "docker-exec",
    category: "docker",
    title: "进入容器 Shell",
    value: "docker exec -it container_name sh",
    detail: "进入容器内部检查文件、环境变量和网络。",
    kind: "command",
    tags: ["debug"],
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
  },
  {
    id: "docker-prune",
    category: "docker",
    title: "清理未使用资源",
    value: "docker system prune",
    detail: "释放磁盘前先确认不会删除仍需要的缓存和停止容器。",
    kind: "command",
    tags: ["clean"],
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
  },
  {
    id: "node-run",
    category: "node",
    title: "查看可运行脚本",
    value: "npm run",
    detail: "列出 package.json scripts，接手项目时先看这里。",
    kind: "command",
    tags: ["scripts"],
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
  },
  {
    id: "node-outdated",
    category: "node",
    title: "检查过期依赖",
    value: "npm outdated",
    detail: "查看 current、wanted、latest 三列，判断升级范围。",
    kind: "command",
    tags: ["deps"],
  },
  {
    id: "node-why",
    category: "node",
    title: "定位依赖来源",
    value: "npm explain package-name",
    detail: "查某个包为什么会出现在依赖树中。",
    kind: "command",
    tags: ["deps", "debug"],
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
  },
  {
    id: "linux-cd-home",
    category: "linux",
    title: "回到用户目录",
    value: "cd ~",
    detail: "快速回到当前用户的 home 目录，适合从很深的路径退出来。",
    kind: "command",
    tags: ["path", "beginner"],
  },
  {
    id: "linux-mkdir",
    category: "linux",
    title: "创建多级目录",
    value: "mkdir -p logs/app",
    detail: "-p 会自动创建不存在的上级目录，目录已存在也不会报错。",
    kind: "command",
    tags: ["file", "directory"],
  },
  {
    id: "linux-cp-dir",
    category: "linux",
    title: "复制目录",
    value: "cp -r source_dir target_dir",
    detail: "递归复制目录及其内容，复制前确认目标路径。",
    kind: "command",
    tags: ["file", "copy"],
  },
  {
    id: "linux-mv",
    category: "linux",
    title: "移动或重命名",
    value: "mv old_name new_name",
    detail: "同目录下是重命名，不同目录下是移动。",
    kind: "command",
    tags: ["file", "rename"],
  },
  {
    id: "linux-rm-safe",
    category: "linux",
    title: "删除文件",
    value: "rm file.txt",
    detail: "删除不可恢复，递归删除目录前先用 ls 确认路径。",
    kind: "command",
    tags: ["file", "delete"],
  },
  {
    id: "linux-du",
    category: "linux",
    title: "查看目录大小",
    value: "du -sh *",
    detail: "查看当前目录下各项占用，排查磁盘空间最常用。",
    kind: "command",
    tags: ["disk"],
  },
  {
    id: "linux-df",
    category: "linux",
    title: "查看磁盘空间",
    value: "df -h",
    detail: "显示各分区剩余空间，服务器构建失败时常用。",
    kind: "command",
    tags: ["disk"],
  },
  {
    id: "linux-chmod",
    category: "linux",
    title: "增加执行权限",
    value: "chmod +x script.sh",
    detail: "脚本提示 permission denied 时，常需要先加执行权限。",
    kind: "command",
    tags: ["permission"],
  },
  {
    id: "linux-curl-head",
    category: "linux",
    title: "检查 URL 响应头",
    value: "curl -I https://example.com",
    detail: "快速看 HTTP 状态码、重定向和缓存头。",
    kind: "command",
    tags: ["network", "http"],
  },
  {
    id: "linux-tar",
    category: "linux",
    title: "解压 tar.gz",
    value: "tar -xzvf archive.tar.gz",
    detail: "解压常见 Linux 压缩包，x 解包、z gzip、v 显示过程、f 指定文件。",
    kind: "command",
    tags: ["archive"],
  },
  {
    id: "git-add-patch",
    category: "git",
    title: "交互式暂存部分改动",
    value: "git add -p",
    detail: "把同一文件里的改动拆开暂存，适合提交保持干净。",
    kind: "command",
    tags: ["stage", "review"],
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
  },
  {
    id: "git-pull-rebase",
    category: "git",
    title: "拉取并变基",
    value: "git pull --rebase",
    detail: "更新当前分支并尽量保持提交历史线性。",
    kind: "command",
    tags: ["sync"],
  },
  {
    id: "git-fetch",
    category: "git",
    title: "获取远端更新",
    value: "git fetch --all --prune",
    detail: "同步远端分支信息并清理已删除的远端引用。",
    kind: "command",
    tags: ["sync", "remote"],
  },
  {
    id: "git-branch",
    category: "git",
    title: "查看分支",
    value: "git branch -vv",
    detail: "查看本地分支、上游分支和领先/落后状态。",
    kind: "command",
    tags: ["branch"],
  },
  {
    id: "git-show",
    category: "git",
    title: "查看某次提交",
    value: "git show --stat HEAD",
    detail: "快速看最近提交改了哪些文件和摘要。",
    kind: "command",
    tags: ["history"],
  },
  {
    id: "git-blame",
    category: "git",
    title: "查看每行来源",
    value: "git blame path/to/file",
    detail: "定位某行是谁在什么时候改的，用于理解历史背景。",
    kind: "command",
    tags: ["history", "debug"],
  },
  {
    id: "git-cherry-pick",
    category: "git",
    title: "摘取提交",
    value: "git cherry-pick <commit>",
    detail: "把另一个分支上的某个提交应用到当前分支。",
    kind: "command",
    tags: ["branch"],
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
  },
  {
    id: "vscode-peek-definition",
    category: "vscode",
    title: "预览定义",
    value: "Alt+F12",
    detail: "在当前文件内弹出定义预览，不打断上下文。",
    kind: "shortcut",
    tags: ["navigate"],
  },
  {
    id: "vscode-find-file",
    category: "vscode",
    title: "文件内搜索",
    value: "Ctrl+F",
    detail: "在当前文件查找文本。",
    kind: "shortcut",
    tags: ["search"],
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
  },
  {
    id: "vscode-format",
    category: "vscode",
    title: "格式化当前文件",
    value: "Shift+Alt+F",
    detail: "用配置好的 formatter 格式化当前文件。",
    kind: "shortcut",
    tags: ["format"],
  },
  {
    id: "vscode-comment",
    category: "vscode",
    title: "切换行注释",
    value: "Ctrl+/",
    detail: "快速注释或取消注释当前行/选中区域。",
    kind: "shortcut",
    tags: ["edit"],
  },
  {
    id: "vscode-debug",
    category: "vscode",
    title: "开始调试",
    value: "F5",
    detail: "按当前 launch 配置启动调试。",
    kind: "shortcut",
    tags: ["debug"],
  },
  {
    id: "vscode-sidebar",
    category: "vscode",
    title: "切换侧边栏",
    value: "Ctrl+B",
    detail: "隐藏或显示左侧栏，给编辑器更多空间。",
    kind: "shortcut",
    tags: ["layout"],
  },
  {
    id: "docker-images",
    category: "docker",
    title: "查看镜像",
    value: "docker images",
    detail: "列出本地镜像、标签和大小。",
    kind: "command",
    tags: ["image"],
  },
  {
    id: "docker-stop",
    category: "docker",
    title: "停止容器",
    value: "docker stop container_name",
    detail: "优雅停止正在运行的容器。",
    kind: "command",
    tags: ["container"],
  },
  {
    id: "docker-rm",
    category: "docker",
    title: "删除已停止容器",
    value: "docker rm container_name",
    detail: "删除不再需要的停止容器，不会删除镜像。",
    kind: "command",
    tags: ["container", "clean"],
  },
  {
    id: "docker-build",
    category: "docker",
    title: "构建镜像",
    value: "docker build -t app:dev .",
    detail: "基于当前目录 Dockerfile 构建镜像并打标签。",
    kind: "command",
    tags: ["image", "build"],
  },
  {
    id: "docker-pull",
    category: "docker",
    title: "拉取镜像",
    value: "docker pull postgres:16",
    detail: "从镜像仓库下载指定版本镜像。",
    kind: "command",
    tags: ["image"],
  },
  {
    id: "docker-compose-down",
    category: "docker",
    title: "停止 Compose 服务",
    value: "docker compose down",
    detail: "停止并移除 compose 创建的容器和默认网络。",
    kind: "command",
    tags: ["compose"],
  },
  {
    id: "docker-compose-logs",
    category: "docker",
    title: "查看 Compose 日志",
    value: "docker compose logs -f service_name",
    detail: "跟随某个 compose 服务日志。",
    kind: "command",
    tags: ["compose", "log"],
  },
  {
    id: "docker-stats",
    category: "docker",
    title: "查看容器资源",
    value: "docker stats",
    detail: "实时查看容器 CPU、内存、网络和磁盘 IO。",
    kind: "command",
    tags: ["monitor"],
  },
  {
    id: "node-ci",
    category: "node",
    title: "按 lockfile 干净安装",
    value: "npm ci",
    detail: "CI 或干净环境中按 lockfile 精确安装依赖。",
    kind: "command",
    tags: ["deps", "ci"],
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
  },
  {
    id: "node-lint",
    category: "node",
    title: "运行 lint",
    value: "npm run lint",
    detail: "检查代码风格和常见错误，具体规则由项目配置决定。",
    kind: "command",
    tags: ["lint"],
  },
  {
    id: "node-pnpm-install",
    category: "node",
    title: "pnpm 安装依赖",
    value: "pnpm install",
    detail: "使用 pnpm 根据 lockfile 安装依赖。",
    kind: "command",
    tags: ["deps", "pnpm"],
  },
  {
    id: "node-pnpm-dev",
    category: "node",
    title: "pnpm 启动开发服务",
    value: "pnpm dev",
    detail: "很多 pnpm 项目的本地开发入口。",
    kind: "command",
    tags: ["dev", "pnpm"],
  },
  {
    id: "node-cache",
    category: "node",
    title: "清理 npm 缓存",
    value: "npm cache verify",
    detail: "检查并修复 npm 缓存，安装异常时可先尝试。",
    kind: "command",
    tags: ["cache", "deps"],
  },
  {
    id: "node-npx",
    category: "node",
    title: "临时运行包命令",
    value: "npx package-name",
    detail: "不全局安装也能执行包提供的 CLI。",
    kind: "command",
    tags: ["cli"],
  },
];

const COPY_COUNT_STORAGE_KEY = "devlauncher.quickmemory.copyCounts";
const ORDER_STORAGE_KEY = "devlauncher.quickmemory.order";

const kindLabel: Record<MemoryKind, string> = {
  command: "命令",
  shortcut: "快捷键",
};

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function loadCopyCounts(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(COPY_COUNT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
        .map(([key, value]) => [key, Math.max(0, value as number)])
    );
  } catch {
    return {};
  }
}

function saveCopyCounts(counts: Record<string, number>) {
  window.localStorage.setItem(COPY_COUNT_STORAGE_KEY, JSON.stringify(counts));
}

type OrderState = Partial<Record<CategoryId, string[]>>;
interface PointerDragState {
  itemId: string;
  startX: number;
  startY: number;
  isDragging: boolean;
}

function loadOrderState(): OrderState {
  try {
    const raw = window.localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const next: OrderState = {};
    for (const category of CATEGORIES) {
      const value = (parsed as Record<string, unknown>)[category.id];
      if (Array.isArray(value)) {
        next[category.id] = value.filter((id): id is string => typeof id === "string");
      }
    }
    return next;
  } catch {
    return {};
  }
}

function saveOrderState(order: OrderState) {
  window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
}

function getOrderedCategoryItems(category: CategoryId, orderState: OrderState): MemoryItem[] {
  const baseItems = MEMORY_ITEMS
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.category === category)
    .sort((a, b) => {
      const priorityDiff = Number(Boolean(b.item.priority)) - Number(Boolean(a.item.priority));
      if (priorityDiff !== 0) return priorityDiff;
      return a.index - b.index;
    })
    .map(({ item }) => item);
  const savedOrder = orderState[category]?.filter((id) => baseItems.some((item) => item.id === id)) ?? [];
  if (savedOrder.length === 0) return baseItems;

  const byId = new Map(baseItems.map((item) => [item.id, item]));
  const ordered = savedOrder.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const missing = baseItems.filter((item) => !savedOrder.includes(item.id));
  return [...ordered, ...missing];
}

export function QuickMemoryApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardListRef = useRef<HTMLElement | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryId>("linux");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyCounts, setCopyCounts] = useState<Record<string, number>>(() => loadCopyCounts());
  const [orderState, setOrderState] = useState<OrderState>(() => loadOrderState());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const pointerDragRef = useRef<PointerDragState | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    applyThemeFromConfig();
    getCurrentWindow().setAlwaysOnTop(false).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeWindow();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return getOrderedCategoryItems(activeCategory, orderState)
      .filter((item) => {
        if (!normalized) return true;
        const haystack = [
          item.title,
          item.value,
          item.detail,
          item.kind,
          ...item.tags,
        ].join(" ").toLowerCase();
        return haystack.includes(normalized);
      })
  }, [activeCategory, orderState, query]);

  const activeMeta = CATEGORIES.find((category) => category.id === activeCategory) ?? CATEGORIES[0];
  const categoryCount = MEMORY_ITEMS.filter((item) => item.category === activeCategory).length;

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(cardListRef, () => {
    if (draggingId || !cardListRef.current) return;
    const cards = Array.from(cardListRef.current.querySelectorAll<HTMLElement>("[data-memory-card-id]"));
    animateListEnter(cards, reducedMotion);
  }, [activeCategory, query, filteredItems.length, draggingId, reducedMotion]);

  const closeWindow = () => {
    getCurrentWindow().hide().catch((error) => {
      console.error("hide quick memory window failed", error);
    });
  };

  const handleClose = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    closeWindow();
  };

  const handleDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    getCurrentWindow().startDragging().catch((error) => {
      console.error("start quick memory drag failed", error);
    });
  };

  const handleCopy = async (item: MemoryItem) => {
    try {
      await copyText(item.value);
      setCopiedId(item.id);
      setCopyCounts((current) => {
        const next = { ...current, [item.id]: (current[item.id] ?? 0) + 1 };
        saveCopyCounts(next);
        return next;
      });
      window.setTimeout(() => setCopiedId((current) => current === item.id ? null : current), 1200);
    } catch (error) {
      console.error("copy quick memory failed", error);
    }
  };

  const handleCardClick = (item: MemoryItem) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    handleCopy(item);
  };

  const swapCards = (draggedItemId: string, targetItemId: string) => {
    if (draggedItemId === targetItemId) return;
    const draggedItem = MEMORY_ITEMS.find((item) => item.id === draggedItemId);
    const targetItem = MEMORY_ITEMS.find((item) => item.id === targetItemId);
    if (!draggedItem || !targetItem || draggedItem.category !== targetItem.category) return;

    const category = draggedItem.category;
    const currentIds = getOrderedCategoryItems(category, orderState).map((item) => item.id);
    const draggedIndex = currentIds.indexOf(draggedItemId);
    const targetIndex = currentIds.indexOf(targetItemId);
    if (draggedIndex < 0 || targetIndex < 0) return;
    const nextIds = [...currentIds];
    nextIds[draggedIndex] = targetItemId;
    nextIds[targetIndex] = draggedItemId;
    const nextOrder = { ...orderState, [category]: nextIds };
    setOrderState(nextOrder);
    saveOrderState(nextOrder);
  };

  const resetPointerDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
    setDragPos(null);
    pointerDragRef.current = null;
    window.setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 0);
  };

  const registerCard = (id: string, element: HTMLElement | null) => {
    if (element) {
      cardRefs.current.set(id, element);
    } else {
      cardRefs.current.delete(id);
    }
  };

  const getDropTargetAtPoint = (x: number, y: number, draggedItemId: string): string | null => {
    for (const [id, element] of cardRefs.current) {
      if (id === draggedItemId) continue;
      const rect = element.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return id;
      }
    }
    return null;
  };

  const handleCardMouseDown = (item: MemoryItem, event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    pointerDragRef.current = {
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const state = pointerDragRef.current;
      if (!state) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (!state.isDragging && Math.hypot(dx, dy) < 4) return;
      if (!state.isDragging) {
        state.isDragging = true;
        suppressNextClickRef.current = true;
        setDraggingId(state.itemId);
      }
      setDragPos({ x: moveEvent.clientX, y: moveEvent.clientY });
      setDropTarget(getDropTargetAtPoint(moveEvent.clientX, moveEvent.clientY, state.itemId));
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const state = pointerDragRef.current;
      if (state?.isDragging) {
        const target = getDropTargetAtPoint(upEvent.clientX, upEvent.clientY, state.itemId);
        if (target) swapCards(state.itemId, target);
      }
      resetPointerDrag();
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const renderDragGhost = () => {
    if (!draggingId || !dragPos) return null;
    const item = MEMORY_ITEMS.find((entry) => entry.id === draggingId);
    if (!item) return null;
    return (
      <div
        style={{
          position: "fixed",
          left: dragPos.x - 95,
          top: dragPos.y - 58,
          width: 190,
          minHeight: 116,
          borderRadius: 8,
          border: `1px solid ${activeMeta.accent}`,
          background: "rgba(15,23,42,0.96)",
          boxShadow: "0 18px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
          padding: 9,
          display: "grid",
          gridTemplateRows: "auto auto 1fr auto",
          gap: 6,
          pointerEvents: "none",
          zIndex: 9999,
          opacity: 0.9,
          transform: "scale(1.04)",
          transition: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title}
          </span>
          <span
            style={{
              fontSize: 10,
              color: item.kind === "command" ? "#bae6fd" : "#fed7aa",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 999,
              padding: "2px 6px",
              flexShrink: 0,
            }}
          >
            {kindLabel[item.kind]}
          </span>
        </div>
        <div
          style={{
            minHeight: 30,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(3,7,18,0.52)",
            color: "#e2e8f0",
            padding: "6px 8px",
            fontFamily: "Cascadia Code, Consolas, monospace",
            fontSize: 11,
            lineHeight: 1.35,
            overflowWrap: "anywhere",
          }}
        >
          {item.value}
        </div>
        <p style={{ margin: 0, color: "rgba(226,232,240,0.60)", fontSize: 11, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {item.detail}
        </p>
        <span style={{ fontSize: 10, color: activeMeta.accent }}>拖拽排序</span>
      </div>
    );
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: "#eef2ff",
        overflow: "hidden",
      }}
    >
      <div
        ref={rootRef}
        className="glass"
        style={{
          width: "calc(100vw - 20px)",
          height: "calc(100vh - 20px)",
          minWidth: 720,
          minHeight: 520,
          borderRadius: 14,
          display: "grid",
          gridTemplateRows: "54px 1fr",
          overflow: "hidden",
          background: "rgba(13, 17, 30, 0.92)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div
          onMouseDown={handleDragStart}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            cursor: "move",
          }}
        >
          <div
            title="拖动移动窗口"
            style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, alignSelf: "stretch", minWidth: 0 }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(135deg, rgba(94,234,212,0.22), rgba(249,115,22,0.20))",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#bffbf0",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              MEM
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0 }}>快捷记忆</div>
              <div style={{ fontSize: 11, color: "rgba(226,232,240,0.56)", marginTop: 2 }}>
                开发常用命令与快捷键速查
              </div>
            </div>
          </div>

          <div
            onMouseDown={(event) => event.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <input
              onMouseDown={(event) => event.stopPropagation()}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索命令、快捷键、标签"
              style={{
                width: 240,
                height: 32,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#f8fafc",
                outline: "none",
                padding: "0 10px",
                fontSize: 12,
              }}
            />
            <button
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleClose}
              title="关闭 (Esc)"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(248,250,252,0.72)",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: "24px",
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", minHeight: 0 }}>
          <aside
            style={{
              borderRight: "1px solid rgba(255,255,255,0.08)",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minHeight: 0,
              background: "rgba(255,255,255,0.025)",
            }}
          >
            {CATEGORIES.map((category) => {
              const selected = category.id === activeCategory;
              const count = MEMORY_ITEMS.filter((item) => item.category === category.id).length;
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  style={{
                    width: "100%",
                    minHeight: 50,
                    borderRadius: 8,
                    border: selected ? `1px solid ${category.accent}` : "1px solid rgba(255,255,255,0.07)",
                    background: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.025)",
                    color: "#f8fafc",
                    cursor: "pointer",
                    padding: "7px 9px",
                    textAlign: "left",
                    display: "grid",
                    gap: 3,
                    boxShadow: selected ? `inset 3px 0 0 ${category.accent}` : "none",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{category.name}</span>
                    <span style={{ fontSize: 11, color: selected ? category.accent : "rgba(226,232,240,0.42)" }}>
                      {count}
                    </span>
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(226,232,240,0.52)", lineHeight: 1.3 }}>
                    {category.subtitle}
                  </span>
                </button>
              );
            })}
          </aside>

          <main style={{ minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
            <section
              ref={cardListRef}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: activeMeta.accent }} />
                  <h1 style={{ fontSize: 16, lineHeight: 1.2, fontWeight: 750, margin: 0 }}>{activeMeta.name}</h1>
                  <span
                    style={{
                      fontSize: 11,
                      color: activeMeta.accent,
                      border: `1px solid ${activeMeta.accent}55`,
                      borderRadius: 999,
                      padding: "2px 8px",
                      background: `${activeMeta.accent}12`,
                    }}
                  >
                    {categoryCount} 条
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(226,232,240,0.58)", lineHeight: 1.35 }}>
                  左侧用于切换分类；中间卡片是速查内容，点击命令或快捷键即可复制。
                </p>
              </div>

              <div style={{ fontSize: 11, color: "rgba(226,232,240,0.42)" }}>
                {query ? `匹配 ${filteredItems.length} 条` : "拖拽卡片交换排序"}
              </div>
            </section>

            <section
              style={{
                minHeight: 0,
                overflow: "auto",
                padding: 10,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                alignContent: "start",
                gap: 8,
              }}
            >
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  data-memory-card-id={item.id}
                  ref={(element) => registerCard(item.id, element)}
                  onClick={() => handleCardClick(item)}
                  onMouseDown={(event) => handleCardMouseDown(item, event)}
                  role="button"
                  tabIndex={0}
                  title="点击复制，拖动排序"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleCopy(item);
                    }
                  }}
                  style={{
                    minHeight: 118,
                    borderRadius: 8,
                    border: dropTarget === item.id ? `1px solid ${activeMeta.accent}` : "1px solid rgba(255,255,255,0.08)",
                    background: dropTarget === item.id ? `${activeMeta.accent}16` : "rgba(255,255,255,0.045)",
                    padding: 9,
                    display: "grid",
                    gridTemplateRows: "auto auto 1fr auto",
                    gap: 6,
                    cursor: "grab",
                    opacity: draggingId === item.id ? 0.28 : 1,
                    outline: "none",
                    userSelect: "none",
                    transform: dropTarget === item.id ? "scale(1.015)" : "scale(1)",
                    boxShadow: dropTarget === item.id ? `0 0 18px ${activeMeta.accent}35` : "none",
                    transition: "opacity 0.12s ease, background 0.12s ease, border-color 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {item.priority && (
                        <span
                          style={{
                            fontSize: 10,
                            color: activeMeta.accent,
                            border: `1px solid ${activeMeta.accent}55`,
                            background: `${activeMeta.accent}12`,
                            borderRadius: 999,
                            padding: "2px 6px",
                          }}
                        >
                          高频
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 10,
                          color: item.kind === "command" ? "#bae6fd" : "#fed7aa",
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.06)",
                          borderRadius: 999,
                          padding: "2px 6px",
                        }}
                      >
                        {kindLabel[item.kind]}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      width: "100%",
                      minHeight: 30,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(3,7,18,0.52)",
                      color: "#e2e8f0",
                      padding: "6px 8px",
                      textAlign: "left",
                      fontFamily: "Cascadia Code, Consolas, monospace",
                      fontSize: 11,
                      lineHeight: 1.35,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.value}
                  </div>

                  <p style={{ margin: 0, color: "rgba(226,232,240,0.60)", fontSize: 11, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {item.detail}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            color: "rgba(226,232,240,0.50)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 999,
                            padding: "1px 5px",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: 10, color: copiedId === item.id ? activeMeta.accent : "rgba(226,232,240,0.38)", flexShrink: 0 }}>
                      {copiedId === item.id ? "已复制" : `复制 ${copyCounts[item.id] ?? 0} 次`}
                    </span>
                  </div>
                </article>
              ))}

              {filteredItems.length === 0 && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    height: 220,
                    borderRadius: 8,
                    border: "1px dashed rgba(255,255,255,0.12)",
                    display: "grid",
                    placeItems: "center",
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 13,
                  }}
                >
                  没有匹配的记忆项
                </div>
              )}
              {renderDragGhost()}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
