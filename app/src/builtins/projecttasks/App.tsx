import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadConfig, saveConfig } from "@/api/config";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { MacWindowControls } from "@/components/MacWindowControls";
import { AddIcon, CopyIcon, DeleteIcon, FavoriteIcon, FolderIcon, RetryIcon } from "@/icons";
import type { ScriptAction } from "@/types/actions";
import {
  PROJECT_TASK_FAVORITES_STORAGE_KEY,
  isTaskFavorite,
  parseTaskFavorites,
  toggleTaskFavorite,
  type FavoriteTaskRef,
} from "./favorites";
import {
  LEGACY_ROOT_STORAGE_KEY,
  PROJECT_HISTORY_STORAGE_KEY,
  parseProjectHistory,
  removeProjectHistory,
  upsertProjectHistory,
} from "./history";
import type { ScannedProject } from "./history";
import { ProjectTerminal, type ProjectTerminalHandle } from "./ProjectTerminal";
import { buildRunmeRefactorPrompt } from "./prompt";
import { WorkflowImportDialog } from "./WorkflowImportDialog";
import {
  importTaskIntoWorkflow,
  type WorkflowImportTarget,
} from "./workflowImport";
import "./projecttasks.css";

interface RunmeTask {
  id: string;
  name: string;
  file: string;
  line: number;
  language: string;
  command: string;
  category: string;
  risk: "safe" | "review" | "dangerous" | string;
  runnable: boolean;
}

interface RunmeDiscovery {
  root: string;
  projectName: string;
  runmeAvailable: boolean;
  runmeVersion?: string;
  scannedFiles: number;
  tasks: RunmeTask[];
  warnings: string[];
}

const IS_TAURI_RUNTIME = Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const IS_DESIGN_PREVIEW =
  import.meta.env.DEV &&
  !IS_TAURI_RUNTIME &&
  new URLSearchParams(window.location.search).get("preview") === "projecttasks";
const PREVIEW_ROOT = "/Users/demo/Projects/devLauncher";
const PREVIEW_PROJECTS: ScannedProject[] = [
  { root: PREVIEW_ROOT, name: "devLauncher", taskCount: 8, scannedFiles: 14, lastScannedAt: Date.now() },
  { root: "/Users/demo/Projects/track-slab-monitor", name: "track-slab-monitor", taskCount: 6, scannedFiles: 9, lastScannedAt: Date.now() - 3_600_000 },
  { root: "/Users/demo/Projects/inspiration-diary", name: "inspiration-diary", taskCount: 3, scannedFiles: 5, lastScannedAt: Date.now() - 86_400_000 },
];
const PREVIEW_DISCOVERY: RunmeDiscovery = {
  root: PREVIEW_ROOT,
  projectName: "devLauncher",
  runmeAvailable: true,
  runmeVersion: "runme 3.17.2",
  scannedFiles: 14,
  tasks: [
    { id: "preview:dev", name: "dev-start", file: "TASKS.md", line: 8, language: "sh", command: "npm run tauri:dev:mac", category: "develop", risk: "safe", runnable: true },
    { id: "preview:test", name: "test-all", file: "TASKS.md", line: 16, language: "sh", command: "npm test\ncargo test", category: "test", risk: "safe", runnable: true },
    { id: "preview:build", name: "build-macos", file: "TASKS.md", line: 24, language: "sh", command: "npm run release:mac", category: "build", risk: "safe", runnable: true },
    { id: "preview:release", name: "release-github", file: "TASKS.md", line: 32, language: "sh", command: "git push origin main", category: "release", risk: "review", runnable: true },
  ],
  warnings: [],
};

const CATEGORY_ORDER = ["setup", "develop", "test", "build", "release", "deploy", "data", "ops"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  favorites: "收藏",
  setup: "环境",
  develop: "开发",
  test: "测试",
  build: "构建",
  release: "发布",
  deploy: "部署",
  data: "数据",
  ops: "运维",
};
const CATEGORY_COLORS: Record<string, string> = {
  favorites: "#fbbf24",
  setup: "#60a5fa",
  develop: "#2dd4bf",
  test: "#a78bfa",
  build: "#fbbf24",
  release: "#fb7185",
  deploy: "#f97316",
  data: "#38bdf8",
  ops: "#94a3b8",
};
const RISK_LABELS: Record<string, string> = {
  safe: "安全",
  review: "需复核",
  dangerous: "高风险",
};

const PANEL: CSSProperties = {
  width: "100vw",
  height: "100vh",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: 14,
  clipPath: "inset(0 round 14px)",
  isolation: "isolate",
  color: "rgba(245,247,255,0.92)",
  background: "var(--theme-bg, rgba(17,20,27,0.92))",
  border: "1px solid var(--theme-border, rgba(255,255,255,0.1))",
  boxShadow: "none",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const BUTTON: CSSProperties = {
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  padding: "0 11px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(245,248,255,0.86)",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const INPUT: CSSProperties = {
  height: 32,
  width: "100%",
  boxSizing: "border-box",
  padding: "0 9px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(0,0,0,0.18)",
  color: "rgba(245,248,255,0.9)",
  outline: "none",
  fontSize: 11,
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? "其他";
}

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#94a3b8";
}

function riskColor(risk: string): string {
  if (risk === "dangerous") return "#fb7185";
  if (risk === "review") return "#fbbf24";
  return "#34d399";
}

function taskFavoriteRef(root: string, task: RunmeTask): FavoriteTaskRef {
  return { root, file: task.file, name: task.name };
}

function formatScannedTime(timestamp: number): string {
  if (!timestamp) return "历史项目";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

async function copyText(text: string): Promise<void> {
  if (IS_TAURI_RUNTIME) {
    await invoke("set_clipboard_text", { text, suppressHistory: true });
    return;
  }
  await navigator.clipboard.writeText(text);
}

export function ProjectTasksApp() {
  const [projectHistory, setProjectHistory] = useState<ScannedProject[]>(() =>
    IS_DESIGN_PREVIEW
      ? PREVIEW_PROJECTS
      : parseProjectHistory(
          localStorage.getItem(PROJECT_HISTORY_STORAGE_KEY),
          localStorage.getItem(LEGACY_ROOT_STORAGE_KEY),
        ),
  );
  const [root, setRoot] = useState(IS_DESIGN_PREVIEW ? PREVIEW_ROOT : "");
  const [discovery, setDiscovery] = useState<RunmeDiscovery | null>(
    IS_DESIGN_PREVIEW ? PREVIEW_DISCOVERY : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    IS_DESIGN_PREVIEW ? PREVIEW_DISCOVERY.tasks[0]?.id ?? null : null,
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("选择一个项目目录开始扫描");
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [scanningRoot, setScanningRoot] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoriteTaskRef[]>(() =>
    parseTaskFavorites(localStorage.getItem(PROJECT_TASK_FAVORITES_STORAGE_KEY)),
  );
  const [workflowImport, setWorkflowImport] = useState<{
    task: RunmeTask;
    source: RunmeDiscovery;
    workflows: NonNullable<Awaited<ReturnType<typeof loadConfig>>["workflows"]>;
  } | null>(null);
  const [workflowImportBusy, setWorkflowImportBusy] = useState(false);
  const [workflowImportError, setWorkflowImportError] = useState("");
  const [feedback, setFeedback] = useState("");
  const terminalRef = useRef<ProjectTerminalHandle>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const discoveryCacheRef = useRef(
    new Map<string, RunmeDiscovery>(
      IS_DESIGN_PREVIEW ? [[PREVIEW_DISCOVERY.root, PREVIEW_DISCOVERY]] : [],
    ),
  );
  const scanSequenceRef = useRef(0);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of discovery?.tasks ?? []) {
      counts.set(task.category, (counts.get(task.category) ?? 0) + 1);
    }
    return counts;
  }, [discovery]);
  const availableCategories = useMemo(() => {
    const known = CATEGORY_ORDER.filter((category) => categoryCounts.has(category));
    const extra = [...categoryCounts.keys()]
      .filter((category) => !CATEGORY_ORDER.includes(category as (typeof CATEGORY_ORDER)[number]))
      .sort();
    return [...known, ...extra];
  }, [categoryCounts]);
  const visibleTasks = useMemo(
    () =>
      categoryFilter === "all"
        ? (discovery?.tasks ?? [])
        : (discovery?.tasks ?? []).filter((task) => task.category === categoryFilter),
    [categoryFilter, discovery],
  );
  const taskGroups = useMemo(
    () => {
      const projectRoot = discovery?.root ?? "";
      const favoriteTasks = projectRoot
        ? visibleTasks.filter((task) => isTaskFavorite(favorites, taskFavoriteRef(projectRoot, task)))
        : [];
      const favoriteIds = new Set(favoriteTasks.map((task) => task.id));
      const categorized = availableCategories
        .filter((category) => categoryFilter === "all" || category === categoryFilter)
        .map((category) => ({
          category,
          tasks: visibleTasks.filter((task) => task.category === category && !favoriteIds.has(task.id)),
        }))
        .filter((group) => group.tasks.length > 0);
      return favoriteTasks.length > 0
        ? [{ category: "favorites", tasks: favoriteTasks }, ...categorized]
        : categorized;
    },
    [availableCategories, categoryFilter, discovery?.root, favorites, visibleTasks],
  );
  const selectedTask = useMemo(
    () => visibleTasks.find((task) => task.id === selectedId) ?? visibleTasks[0] ?? null,
    [selectedId, visibleTasks],
  );
  const aiRefactorPrompt = useMemo(
    () =>
      buildRunmeRefactorPrompt({
        root: discovery?.root ?? root,
        projectName: discovery?.projectName ?? "当前项目",
        scannedFiles: discovery?.scannedFiles ?? 0,
        taskCount: discovery?.tasks.length ?? 0,
      }),
    [discovery, root],
  );
  const selectedTaskFavorite = Boolean(
    discovery
    && selectedTask
    && isTaskFavorite(favorites, taskFavoriteRef(discovery.root, selectedTask)),
  );

  useEffect(() => {
    localStorage.setItem(PROJECT_TASK_FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const showFeedback = (message: string) => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setFeedback(message);
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback("");
      feedbackTimerRef.current = null;
    }, 3200);
  };

  const applyDiscovery = (result: RunmeDiscovery) => {
    setDiscovery(result);
    setSelectedId(result.tasks[0]?.id ?? null);
    setCategoryFilter("all");
    setRoot(result.root);
    setPromptExpanded(result.tasks.length === 0);
    setPromptCopied(false);
  };

  const rememberDiscovery = (result: RunmeDiscovery) => {
    discoveryCacheRef.current.set(result.root, result);
    setProjectHistory((projects) => {
      const next = upsertProjectHistory(projects, {
        root: result.root,
        name: result.projectName,
        taskCount: result.tasks.length,
        scannedFiles: result.scannedFiles,
        lastScannedAt: Date.now(),
      });
      localStorage.setItem(PROJECT_HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const scanProject = async (value = root, clearCurrent = false) => {
    const projectRoot = value.trim();
    if (!projectRoot) {
      setStatus("请先选择项目目录");
      return;
    }
    const requestId = ++scanSequenceRef.current;
    setRoot(projectRoot);
    setScanningRoot(projectRoot);
    if (clearCurrent) {
      setDiscovery(null);
      setSelectedId(null);
      setCategoryFilter("all");
    }
    setStatus("正在扫描 Markdown 任务…");
    try {
      const result = await invoke<RunmeDiscovery>("discover_runme_tasks", { root: projectRoot });
      rememberDiscovery(result);
      if (requestId !== scanSequenceRef.current) return;
      applyDiscovery(result);
      localStorage.setItem(LEGACY_ROOT_STORAGE_KEY, result.root);
      setStatus(
        result.tasks.length === 0
          ? `扫描了 ${result.scannedFiles} 个 Markdown 文件，没有发现显式命名任务`
          : `已发现 ${result.tasks.length} 个任务，扫描 ${result.scannedFiles} 个 Markdown 文件`,
      );
    } catch (error) {
      if (requestId !== scanSequenceRef.current) return;
      setStatus(String(error));
    } finally {
      if (requestId === scanSequenceRef.current) {
        setScanningRoot(null);
      }
    }
  };

  const selectScannedProject = (projectRoot: string) => {
    const cached = discoveryCacheRef.current.get(projectRoot);
    if (cached) {
      scanSequenceRef.current += 1;
      setScanningRoot(null);
      applyDiscovery(cached);
      localStorage.setItem(LEGACY_ROOT_STORAGE_KEY, cached.root);
      setStatus(`已切换到 ${cached.projectName}；点击刷新可重新扫描文档`);
      return;
    }
    void scanProject(projectRoot, true);
  };

  useEffect(() => {
    if (IS_DESIGN_PREVIEW) return;
    const storedRoot = projectHistory[0]?.root;
    if (!storedRoot) return;
    setRoot(storedRoot);
    void scanProject(storedRoot, true);
  }, []);

  const removeScannedProject = (projectRoot: string) => {
    discoveryCacheRef.current.delete(projectRoot);
    if (scanningRoot === projectRoot) {
      scanSequenceRef.current += 1;
      setScanningRoot(null);
    }
    setProjectHistory((projects) => {
      const next = removeProjectHistory(projects, projectRoot);
      localStorage.setItem(PROJECT_HISTORY_STORAGE_KEY, JSON.stringify(next));
      if (localStorage.getItem(LEGACY_ROOT_STORAGE_KEY) === projectRoot) {
        if (next[0]) {
          localStorage.setItem(LEGACY_ROOT_STORAGE_KEY, next[0].root);
        } else {
          localStorage.removeItem(LEGACY_ROOT_STORAGE_KEY);
        }
      }
      return next;
    });
    if (root === projectRoot || discovery?.root === projectRoot) {
      setDiscovery(null);
      setSelectedId(null);
      setCategoryFilter("all");
      setRoot("");
      setPromptExpanded(false);
      setStatus("已从扫描历史中移除项目，项目文件未被修改");
    }
  };

  const chooseProject = async () => {
    const selected = await dialogOpen({
      directory: true,
      multiple: false,
      title: "选择项目目录",
    });
    if (typeof selected === "string") {
      setRoot(selected);
      await scanProject(selected, true);
    }
  };

  const runSelectedTask = async () => {
    if (!discovery || !selectedTask) return;
    if (!selectedTask.runnable) {
      setStatus(`暂不支持 ${selectedTask.language} 代码块；当前版本只执行 shell 类任务`);
      return;
    }
    if (selectedTask.risk !== "safe") {
      const confirmed = window.confirm(
        `${RISK_LABELS[selectedTask.risk] ?? "请复核"}任务：${selectedTask.name}\n\n确认发送到终端执行吗？`,
      );
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      const command = await invoke<string>("runme_task_command", {
        root: discovery.root,
        file: selectedTask.file,
        name: selectedTask.name,
      });
      if (!terminalRef.current) throw new Error("项目终端尚未初始化");
      await terminalRef.current.run(command);
      setStatus(`已在项目终端执行 ${selectedTask.name}`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleSelectedTaskFavorite = () => {
    if (!discovery || !selectedTask) return;
    const favorite = taskFavoriteRef(discovery.root, selectedTask);
    setFavorites((current) => toggleTaskFavorite(current, favorite));
    setStatus(selectedTaskFavorite ? "已取消收藏" : "已收藏并置顶");
  };

  const openWorkflowImportDialog = async () => {
    if (!discovery || !selectedTask) return;
    setBusy(true);
    try {
      const config = await loadConfig();
      setWorkflowImport({
        task: selectedTask,
        source: discovery,
        workflows: config.workflows ?? [],
      });
      setWorkflowImportError("");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmWorkflowImport = async (target: WorkflowImportTarget) => {
    if (!workflowImport) return;
    setWorkflowImportBusy(true);
    setWorkflowImportError("");
    try {
      const command = await invoke<string>("runme_task_command", {
        root: workflowImport.source.root,
        file: workflowImport.task.file,
        name: workflowImport.task.name,
      });
      const action: ScriptAction = {
        type: "script",
        name: `Runme · ${workflowImport.task.name}`,
        shell: "terminal",
        content: command,
      };
      const config = await loadConfig();
      const result = importTaskIntoWorkflow(config, action, {
        projectName: workflowImport.source.projectName,
        root: workflowImport.source.root,
        file: workflowImport.task.file,
        line: workflowImport.task.line,
      }, target);
      await saveConfig(result.config);
      void emit("projecttasks-workflow-saved", { workflowId: result.workflowId }).catch(() => {});
      const message = result.created
        ? `已创建工作流“${result.workflowName}”并导入任务`
        : `已将任务添加到“${result.workflowName}”`;
      setStatus(message);
      showFeedback(message);
      setWorkflowImport(null);
    } catch (error) {
      setWorkflowImportError(String(error));
    } finally {
      setWorkflowImportBusy(false);
    }
  };

  const copyCommand = async () => {
    if (!discovery || !selectedTask) return;
    try {
      const command = await invoke<string>("runme_task_command", {
        root: discovery.root,
        file: selectedTask.file,
        name: selectedTask.name,
      });
      await copyText(command);
      setStatus("Runme 命令已复制");
    } catch (error) {
      setStatus(String(error));
    }
  };

  const copyAiRefactorPrompt = async () => {
    try {
      await copyText(aiRefactorPrompt);
      setPromptCopied(true);
      setStatus("AI 重构提示词已复制，可交给 Codex 或其他编码助手执行");
      window.setTimeout(() => setPromptCopied(false), 1600);
    } catch (error) {
      setStatus(`复制 AI 重构提示词失败：${String(error)}`);
    }
  };

  return (
    <div className="projecttasks-window theme-window-surface" style={PANEL} data-tauri-drag-region>
      <header
        className="projecttasks-header"
        style={{
          height: 54,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 15px 0 17px",
          borderBottom: "1px solid rgba(255,255,255,0.09)",
          background: "rgba(17,20,27,0.82)",
          userSelect: "none",
        }}
        data-tauri-drag-region
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BuiltinIcon feature="projecttasks" size={22} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>项目任务</div>
            <div style={{ marginTop: 2, fontSize: 10, color: "rgba(220,226,244,0.5)" }}>
              Runme Markdown 任务发现器
            </div>
          </div>
        </div>
        <MacWindowControls
          showPin={IS_TAURI_RUNTIME}
          onClose={() => getCurrentWindow().hide().catch(() => {})}
          onMinimize={() => getCurrentWindow().minimize().catch(() => getCurrentWindow().hide().catch(() => {}))}
          closeTitle="关闭项目任务"
          minimizeTitle="最小化项目任务"
        />
      </header>

      <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
        <nav
          className="projecttasks-project-sidebar"
          aria-label="已扫描项目"
          style={{
            width: 224,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            padding: "12px 10px",
            borderRight: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ height: 34, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 3px 0 7px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span className="projecttasks-sidebar-title">项目</span>
              <span className="projecttasks-count">{projectHistory.length}</span>
            </div>
            <button
              type="button"
              className="projecttasks-icon-button"
              title="选择并扫描项目"
              aria-label="选择并扫描项目"
              onClick={() => void chooseProject()}
              disabled={busy}
            >
              <AddIcon size={14} decorative style={{ color: "currentColor", display: "block" }} />
            </button>
          </div>
          <div className="projecttasks-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingTop: 5 }}>
            {projectHistory.map((project) => {
              const active = root === project.root;
              const scanning = scanningRoot === project.root;
              return (
                <div
                  className="projecttasks-project-row"
                  data-active={active}
                  aria-busy={scanning}
                  key={project.root}
                >
                  <button
                    className="projecttasks-project-main"
                    type="button"
                    title={`切换到 ${project.root}`}
                    onClick={() => selectScannedProject(project.root)}
                    disabled={busy}
                  >
                    <span className="projecttasks-project-icon">
                      <FolderIcon size={16} decorative />
                    </span>
                    <div className="projecttasks-project-copy">
                      <div className="projecttasks-project-name">{project.name}</div>
                      <div className="projecttasks-project-meta">
                        {scanning ? "正在扫描…" : `${project.taskCount} 个任务 · ${formatScannedTime(project.lastScannedAt)}`}
                      </div>
                      <div className="projecttasks-project-path" title={project.root}>
                        {project.root}
                      </div>
                    </div>
                  </button>
                  <button
                    className="projecttasks-project-remove"
                    type="button"
                    title={`移除 ${project.name}`}
                    aria-label={`从扫描历史移除 ${project.name}`}
                    onClick={() => removeScannedProject(project.root)}
                    disabled={busy || scanning}
                  >
                    <DeleteIcon size={14} decorative style={{ color: "currentColor", display: "block" }} />
                  </button>
                </div>
              );
            })}
            {projectHistory.length === 0 && (
              <div style={{ padding: "24px 9px", color: "rgba(220,226,244,0.38)", fontSize: 10, lineHeight: 1.6 }}>
                扫描过的项目会保存在这里，点击切换，刷新按钮重新扫描。
              </div>
            )}
          </div>
        </nav>
        <aside
          className="projecttasks-task-sidebar"
          style={{
            width: 310,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            padding: 14,
            borderRight: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ height: 34, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1px 0 3px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span className="projecttasks-sidebar-title">任务</span>
              <span className="projecttasks-count">{discovery?.tasks.length ?? 0}</span>
            </div>
            <button
              type="button"
              className="projecttasks-icon-button"
              data-scanning={scanningRoot === root}
              title="重新扫描当前项目"
              aria-label="重新扫描当前项目"
              onClick={() => void scanProject(root)}
              disabled={busy || !root.trim() || scanningRoot === root}
            >
              <RetryIcon size={14} decorative style={{ color: "currentColor", display: "block" }} />
            </button>
          </div>
          <input
            className="projecttasks-path-input"
            aria-label="项目目录"
            value={root}
            onChange={(event) => setRoot(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void scanProject(root, true);
            }}
            placeholder="/path/to/project"
            style={{ ...INPUT, marginTop: 7 }}
          />

          {(discovery?.tasks.length ?? 0) > 0 && (
            <div role="tablist" aria-label="任务类型" style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "12px 0 10px" }}>
              {["all", ...availableCategories].map((category) => {
                const active = categoryFilter === category;
                const count = category === "all" ? discovery?.tasks.length ?? 0 : categoryCounts.get(category) ?? 0;
                return (
                  <button
                    className="projecttasks-filter-tab"
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setCategoryFilter(category);
                      const nextTask = category === "all"
                        ? discovery?.tasks[0]
                        : discovery?.tasks.find((task) => task.category === category);
                      setSelectedId(nextTask?.id ?? null);
                    }}
                    style={{
                      height: 27,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "0 8px",
                      borderRadius: 7,
                      border: `1px solid ${active ? `${category === "all" ? "#2dd4bf" : categoryColor(category)}88` : "rgba(255,255,255,0.08)"}`,
                      background: active ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.025)",
                      color: active ? "rgba(248,250,255,0.94)" : "rgba(220,226,244,0.56)",
                      fontSize: 9.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    <span>{category === "all" ? "全部" : categoryLabel(category)}</span>
                    <span style={{ color: active ? (category === "all" ? "#5eead4" : categoryColor(category)) : "rgba(220,226,244,0.35)" }}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="projecttasks-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 2, marginTop: discovery?.tasks.length ? 0 : 10 }}>
            {taskGroups.map((group) => (
              <section key={group.category} style={{ marginBottom: 10 }}>
                <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 3px 6px", background: "rgba(12,14,25,0.96)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(230,235,248,0.64)", fontSize: 9.5, fontWeight: 800 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: categoryColor(group.category) }} />
                    {categoryLabel(group.category)}
                  </span>
                  <span style={{ color: "rgba(220,226,244,0.34)", fontSize: 9 }}>{group.tasks.length}</span>
                </div>
                {group.tasks.map((task) => {
                  const active = task.id === selectedTask?.id;
                  const favorite = Boolean(
                    discovery
                    && isTaskFavorite(favorites, taskFavoriteRef(discovery.root, task)),
                  );
                  return (
                    <button
                      className="projecttasks-task-item"
                      data-active={active}
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedId(task.id)}
                      style={{
                        width: "100%",
                        display: "block",
                        marginBottom: 7,
                        padding: "10px 11px",
                        borderRadius: 9,
                        border: `1px solid ${active ? `${categoryColor(task.category)}88` : "rgba(255,255,255,0.08)"}`,
                        background: active ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.035)",
                        color: "inherit",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 750 }}>
                          {task.name}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, fontSize: 9, color: riskColor(task.risk) }}>
                          {favorite && <FavoriteIcon size={11} filled decorative style={{ color: "#fbbf24" }} />}
                          {RISK_LABELS[task.risk] ?? task.risk}
                        </span>
                      </div>
                      <div style={{ marginTop: 5, display: "flex", gap: 7, color: "rgba(220,226,244,0.46)", fontSize: 9 }}>
                        <span>{task.file}:{task.line}</span>
                      </div>
                    </button>
                  );
                })}
              </section>
            ))}
            {!discovery && <div style={{ padding: "28px 12px", color: "rgba(220,226,244,0.42)", fontSize: 11, lineHeight: 1.6 }}>选择项目后，这里会列出 README 或其他 Markdown 文件中的命名代码块。</div>}
            {discovery && discovery.tasks.length === 0 && <div style={{ padding: "28px 12px", color: "rgba(220,226,244,0.42)", fontSize: 11, lineHeight: 1.6 }}>没有找到显式命名的 Runme 任务。右侧可复制 AI 提示词整理项目文档。</div>}
          </div>
        </aside>

        <main className="projecttasks-detail" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="projecttasks-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 850 }}>{selectedTask?.name ?? "等待选择任务"}</div>
              <div style={{ marginTop: 6, color: "rgba(220,226,244,0.5)", fontSize: 11 }}>
                {selectedTask ? `${selectedTask.file}:${selectedTask.line} · ${selectedTask.language}` : status}
              </div>
            </div>
            {selectedTask && (
              <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                <button
                  type="button"
                  className="projecttasks-button"
                  style={{
                    ...BUTTON,
                    borderColor: selectedTaskFavorite ? "rgba(251,191,36,0.48)" : "rgba(255,255,255,0.13)",
                    color: selectedTaskFavorite ? "#fbbf24" : BUTTON.color,
                  }}
                  onClick={toggleSelectedTaskFavorite}
                  title={selectedTaskFavorite ? "取消收藏" : "收藏并置顶"}
                >
                  <FavoriteIcon size={13} filled={selectedTaskFavorite} decorative />
                  {selectedTaskFavorite ? "已收藏" : "收藏"}
                </button>
                <button type="button" className="projecttasks-button" style={BUTTON} onClick={() => void copyCommand()}>
                  <CopyIcon size={13} decorative />
                  复制
                </button>
                <button type="button" className="projecttasks-button" style={BUTTON} onClick={() => void openWorkflowImportDialog()} disabled={busy || !selectedTask.runnable}>保存为工作流</button>
                <button type="button" className="projecttasks-button" style={{ ...BUTTON, borderColor: "rgba(45,212,191,0.52)", background: "rgba(20,184,166,0.18)", color: "#9ff8e8" }} onClick={() => void runSelectedTask()} disabled={busy || !discovery?.runmeAvailable || !selectedTask.runnable}>
                  执行任务
                </button>
              </div>
            )}
          </div>

          <section style={{ marginTop: 18, padding: 14, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, background: "rgba(8,10,18,0.28)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800 }}>命令预览</div>
              {selectedTask && <span style={{ color: riskColor(selectedTask.risk), fontSize: 10 }}>{RISK_LABELS[selectedTask.risk] ?? selectedTask.risk}</span>}
            </div>
            <pre style={{ minHeight: 105, margin: "10px 0 0", padding: 12, overflow: "auto", borderRadius: 8, background: "rgba(0,0,0,0.3)", color: "#b7f7e9", fontFamily: "'SFMono-Regular', Consolas, monospace", fontSize: 11, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{selectedTask?.command ?? "选择一个任务后显示代码块内容"}</pre>
          </section>

          <section style={{ marginTop: 13, padding: 14, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, background: "rgba(8,10,18,0.22)" }}>
            <div style={{ fontSize: 11, fontWeight: 800 }}>运行说明</div>
            <div style={{ marginTop: 8, color: "rgba(220,226,244,0.54)", fontSize: 10.5, lineHeight: 1.65 }}>
              执行会在下方项目终端中调用 <code>runme run</code>。保存为工作流后，任务会成为普通脚本步骤，可继续配置条件、完成规则和键位绑定。
            </div>
          </section>

          {(discovery?.warnings.length ?? 0) > 0 && (
            <section style={{ marginTop: 13, padding: 13, border: "1px solid rgba(251,191,36,0.24)", borderRadius: 8, background: "rgba(251,191,36,0.07)" }}>
              <div style={{ color: "#fbbf24", fontSize: 10, fontWeight: 800 }}>扫描提示</div>
              {discovery?.warnings.map((warning) => <div key={warning} style={{ marginTop: 5, color: "rgba(255,239,190,0.72)", fontSize: 10, lineHeight: 1.5 }}>{warning}</div>)}
            </section>
          )}

          {discovery && (
            <section style={{ marginTop: 13, padding: 14, border: `1px solid ${discovery.tasks.length === 0 ? "rgba(45,212,191,0.34)" : "rgba(255,255,255,0.08)"}`, borderRadius: 8, background: discovery.tasks.length === 0 ? "rgba(20,184,166,0.08)" : "rgba(8,10,18,0.22)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800 }}>AI 整理任务文档</div>
                  <div style={{ marginTop: 5, color: "rgba(220,226,244,0.54)", fontSize: 10.5, lineHeight: 1.55 }}>
                    {discovery.tasks.length === 0
                      ? "当前项目没有显式命名任务。复制提示词，让 AI 核对现有脚本并整理 README 或 TASKS.md。"
                      : "扫描结果不准确、遗漏任务或混入说明内容时，可让 AI 按统一 Runme 规则整理项目文档。"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                  <button type="button" className="projecttasks-button" style={BUTTON} onClick={() => setPromptExpanded((value) => !value)}>
                    {promptExpanded ? "收起提示词" : "查看提示词"}
                  </button>
                  <button type="button" className="projecttasks-button" style={{ ...BUTTON, borderColor: "rgba(45,212,191,0.52)", color: "#9ff8e8" }} onClick={() => void copyAiRefactorPrompt()}>
                    {promptCopied ? "已复制" : "复制提示词"}
                  </button>
                </div>
              </div>
              {promptExpanded && (
                <pre style={{ maxHeight: 280, margin: "12px 0 0", padding: 12, overflow: "auto", borderRadius: 8, background: "rgba(0,0,0,0.3)", color: "rgba(225,234,248,0.76)", fontFamily: "'SFMono-Regular', Consolas, monospace", fontSize: 10.5, lineHeight: 1.55, whiteSpace: "pre-wrap", userSelect: "text" }}>
                  {aiRefactorPrompt}
                </pre>
              )}
            </section>
          )}

          <div style={{ minHeight: 26, marginTop: 12, color: "rgba(220,226,244,0.5)", fontSize: 10 }}>{status}</div>
          </div>
          <ProjectTerminal ref={terminalRef} cwd={discovery?.root ?? ""} />
        </main>
      </div>
      {feedback && (
        <div className="projecttasks-feedback" role="status" aria-live="polite">
          {feedback}
        </div>
      )}
      {workflowImport && (
        <WorkflowImportDialog
          taskName={workflowImport.task.name}
          workflows={workflowImport.workflows}
          busy={workflowImportBusy}
          error={workflowImportError}
          onClose={() => {
            if (workflowImportBusy) return;
            setWorkflowImport(null);
            setWorkflowImportError("");
          }}
          onConfirm={(target) => void confirmWorkflowImport(target)}
        />
      )}
    </div>
  );
}
