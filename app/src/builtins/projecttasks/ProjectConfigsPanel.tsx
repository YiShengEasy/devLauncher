import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { AddIcon, CheckIcon, FavoriteIcon, FileIcon, FolderIcon, RetryIcon } from "@/icons";
import {
  PROJECT_CONFIG_FAVORITES_STORAGE_KEY,
  isConfigFavorite,
  parseConfigFavorites,
  sortConfigsByFavorite,
  toggleConfigFavorite,
  type FavoriteConfigRef,
} from "./configFavorites";
import { resolveInitialConfigRoot } from "./configStartup";
import {
  LEGACY_ROOT_STORAGE_KEY,
  PROJECT_HISTORY_STORAGE_KEY,
  parseProjectHistory,
  upsertProjectHistory,
  type ScannedProject,
} from "./history";

interface ProjectConfigFile {
  path: string;
  name: string;
  format: string;
  environment: string;
  environmentLabel: string;
  environmentSource: "filename" | "parent" | "common" | string;
  sensitiveCount: number;
  size: number;
  modifiedAt: number;
}

interface ProjectConfigDiscovery {
  root: string;
  projectName: string;
  scannedFiles: number;
  files: ProjectConfigFile[];
  warnings: string[];
}

interface ProjectConfigContent {
  path: string;
  format: string;
  environment: string;
  environmentLabel: string;
  content: string;
  maskedContent: string;
  contentHash: string;
  sensitiveCount: number;
  modifiedAt: number;
}

interface ProjectConfigValidation {
  maskedContent: string;
  sensitiveCount: number;
}

interface ProjectConfigsPanelProps {
  initialRoot: string;
  onRootChange: (root: string) => void;
}

const IS_TAURI_RUNTIME = Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const ENVIRONMENT_ORDER = ["common", "local", "development", "test", "qa", "staging", "production"];

function environmentSourceLabel(source: string): string {
  if (source === "filename") return "来自文件名";
  if (source === "parent") return "来自上一级文件夹";
  return "公共配置";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
}

const EMPTY_STYLE = { padding: "28px 12px", color: "rgba(220,226,244,0.42)", fontSize: 11, lineHeight: 1.6 } as const;

export function ProjectConfigsPanel({ initialRoot, onRootChange }: ProjectConfigsPanelProps) {
  const [projects, setProjects] = useState<ScannedProject[]>(() =>
    parseProjectHistory(
      localStorage.getItem(PROJECT_HISTORY_STORAGE_KEY),
      localStorage.getItem(LEGACY_ROOT_STORAGE_KEY),
    ),
  );
  const [root, setRoot] = useState(() => resolveInitialConfigRoot(initialRoot, projects));
  const [favorites, setFavorites] = useState<FavoriteConfigRef[]>(() =>
    parseConfigFavorites(localStorage.getItem(PROJECT_CONFIG_FAVORITES_STORAGE_KEY)),
  );
  const [discovery, setDiscovery] = useState<ProjectConfigDiscovery | null>(null);
  const [environment, setEnvironment] = useState("all");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<ProjectConfigContent | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [savePreview, setSavePreview] = useState(false);
  const [pendingMaskedContent, setPendingMaskedContent] = useState("");
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("选择项目后扫描配置文件");
  const scanSequence = useRef(0);
  const initialScanStarted = useRef(false);

  useEffect(() => {
    localStorage.setItem(PROJECT_CONFIG_FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const environments = useMemo(() => {
    const values = new Map<string, string>();
    for (const file of discovery?.files ?? []) values.set(file.environment, file.environmentLabel);
    return [...values.entries()].sort(([left], [right]) => {
      const leftIndex = ENVIRONMENT_ORDER.indexOf(left);
      const rightIndex = ENVIRONMENT_ORDER.indexOf(right);
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex) || left.localeCompare(right);
    });
  }, [discovery]);

  const visibleFiles = useMemo(() => {
    const filtered = (discovery?.files ?? []).filter(
      (file) => environment === "all" || file.environment === environment,
    );
    return sortConfigsByFavorite(filtered, root, favorites);
  }, [discovery, environment, favorites, root]);
  const selectedFile = (discovery?.files ?? []).find((file) => file.path === selectedPath) ?? null;
  const selectedFavorite = Boolean(
    selectedFile && isConfigFavorite(favorites, { root, path: selectedFile.path }),
  );
  const changed = Boolean(loaded && editorContent !== loaded.content);
  const production = loaded?.environment === "production";

  const rememberProject = (result: ProjectConfigDiscovery) => {
    setProjects((current) => {
      const existing = current.find((item) => item.root === result.root);
      const next = upsertProjectHistory(current, {
        root: result.root,
        name: result.projectName,
        taskCount: existing?.taskCount ?? 0,
        scannedFiles: existing?.scannedFiles ?? 0,
        lastScannedAt: existing?.lastScannedAt ?? Date.now(),
      });
      localStorage.setItem(PROJECT_HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleFavorite = (projectRoot: string, file: ProjectConfigFile) => {
    const reference = { root: projectRoot, path: file.path };
    const favorite = isConfigFavorite(favorites, reference);
    setFavorites((current) => toggleConfigFavorite(current, reference));
    setStatus(favorite ? `已取消收藏 ${file.path}` : `已收藏并置顶 ${file.path}`);
  };

  const openFile = async (projectRoot: string, file: ProjectConfigFile) => {
    setBusy(true);
    setStatus(`正在读取 ${file.path}…`);
    try {
      const result = await invoke<ProjectConfigContent>("read_project_config", { root: projectRoot, file: file.path });
      setSelectedPath(file.path);
      setLoaded(result);
      setEditorContent(result.content);
      setEditing(false);
      setShowSensitive(false);
      setSavePreview(false);
      setPendingMaskedContent("");
      setProductionConfirmed(false);
      setStatus(`已加载 ${file.path}`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  const scanProject = async (value: string) => {
    const projectRoot = value.trim();
    if (!projectRoot) {
      setStatus("请先选择项目目录");
      return;
    }
    const requestId = ++scanSequence.current;
    setRoot(projectRoot);
    onRootChange(projectRoot);
    setBusy(true);
    setStatus("正在扫描项目配置…");
    try {
      const result = await invoke<ProjectConfigDiscovery>("discover_project_configs", { root: projectRoot });
      if (requestId !== scanSequence.current) return;
      setDiscovery(result);
      setEnvironment("all");
      setSelectedPath(null);
      setLoaded(null);
      setEditorContent("");
      rememberProject(result);
      localStorage.setItem(LEGACY_ROOT_STORAGE_KEY, result.root);
      setRoot(result.root);
      onRootChange(result.root);
      setStatus(result.files.length ? `发现 ${result.files.length} 个配置文件` : "没有发现支持的配置文件");
      const first = sortConfigsByFavorite(result.files, result.root, favorites)[0];
      if (first) await openFile(result.root, first);
    } catch (error) {
      if (requestId === scanSequence.current) setStatus(String(error));
    } finally {
      if (requestId === scanSequence.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (initialScanStarted.current) return;
    const projectRoot = resolveInitialConfigRoot(initialRoot, projects);
    if (!projectRoot) return;
    initialScanStarted.current = true;
    void scanProject(projectRoot);
  }, [initialRoot, projects]);

  const chooseProject = async () => {
    if (!IS_TAURI_RUNTIME) return;
    const selected = await dialogOpen({ directory: true, multiple: false, title: "选择项目目录" });
    if (typeof selected === "string") await scanProject(selected);
  };

  const previewSave = async () => {
    if (!loaded || !changed) return;
    setBusy(true);
    setStatus("正在校验配置语法…");
    try {
      const validation = await invoke<ProjectConfigValidation>("validate_project_config", {
        root,
        file: loaded.path,
        content: editorContent,
      });
      setShowSensitive(false);
      setPendingMaskedContent(validation.maskedContent);
      setSavePreview(true);
      setProductionConfirmed(false);
      setStatus("语法校验通过，请确认差异");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmSave = async () => {
    if (!loaded || (production && !productionConfirmed)) return;
    setBusy(true);
    setStatus("正在保存配置…");
    try {
      await invoke("save_project_config", {
        root,
        file: loaded.path,
        content: editorContent,
        expectedHash: loaded.contentHash,
      });
      const refreshed = await invoke<ProjectConfigContent>("read_project_config", {
        root,
        file: loaded.path,
      });
      setLoaded(refreshed);
      setEditorContent(refreshed.content);
      setSavePreview(false);
      setPendingMaskedContent("");
      setEditing(false);
      setShowSensitive(false);
      setProductionConfirmed(false);
      setStatus(`已安全保存 ${loaded.path}`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="projectconfigs-layout">
      <nav className="projecttasks-project-sidebar projectconfigs-projects" aria-label="项目">
        <div className="projectconfigs-sidebar-heading">
          <span>项目</span>
          <button className="projecttasks-icon-button" type="button" onClick={() => void chooseProject()} disabled={busy || !IS_TAURI_RUNTIME} title="选择项目">
            <AddIcon size={14} decorative />
          </button>
        </div>
        <div className="projecttasks-scroll projectconfigs-project-list">
          {projects.map((project) => (
            <button key={project.root} type="button" className="projectconfigs-project" data-active={root === project.root} onClick={() => void scanProject(project.root)} disabled={busy}>
              <FolderIcon size={15} decorative />
              <span><strong>{project.name}</strong><small>{project.root}</small></span>
            </button>
          ))}
          {!projects.length && <div style={EMPTY_STYLE}>点击“＋”选择一个项目目录。</div>}
        </div>
      </nav>

      <aside className="projecttasks-task-sidebar projectconfigs-files">
        <div className="projectconfigs-sidebar-heading">
          <span>配置文件 <b>{discovery?.files.length ?? 0}</b></span>
          <button className="projecttasks-icon-button" type="button" onClick={() => void scanProject(root)} disabled={busy || !root} title="重新扫描">
            <RetryIcon size={14} decorative />
          </button>
        </div>
        <div className="projectconfigs-environments" role="tablist" aria-label="环境">
          <button type="button" data-active={environment === "all"} onClick={() => setEnvironment("all")}>全部</button>
          {environments.map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-active={environment === id}
              data-production={id === "production"}
              onClick={() => {
                setEnvironment(id);
                const first = visibleFiles.find((file) => file.environment === id)
                  ?? sortConfigsByFavorite(
                    (discovery?.files ?? []).filter((file) => file.environment === id),
                    root,
                    favorites,
                  )[0];
                if (first) void openFile(root, first);
              }}
            >{label}</button>
          ))}
        </div>
        <div className="projecttasks-scroll projectconfigs-file-list">
          {visibleFiles.map((file) => {
            const favorite = isConfigFavorite(favorites, { root, path: file.path });
            return (
              <div className="projectconfigs-file-row" key={file.path}>
                <button className="projectconfigs-file" data-active={selectedPath === file.path} type="button" onClick={() => void openFile(root, file)} disabled={busy}>
                  <FileIcon size={14} decorative />
                  <span>
                    <strong>{file.name}</strong>
                    <small>{file.path}</small>
                    <em>{file.environmentLabel} · {file.format.toUpperCase()} · {formatBytes(file.size)}</em>
                  </span>
                  {file.sensitiveCount > 0 && <b title={`${file.sensitiveCount} 个敏感字段`}>敏感</b>}
                </button>
                <button
                  className="projecttasks-favorite-toggle"
                  data-favorite={favorite}
                  type="button"
                  onClick={() => toggleFavorite(root, file)}
                  title={favorite ? "取消收藏" : "收藏并置顶"}
                  aria-label={favorite ? `取消收藏 ${file.path}` : `收藏并置顶 ${file.path}`}
                >
                  <FavoriteIcon size={13} filled={favorite} decorative />
                </button>
              </div>
            );
          })}
          {discovery && !visibleFiles.length && <div style={EMPTY_STYLE}>当前环境没有配置文件。</div>}
          {!discovery && <div style={EMPTY_STYLE}>选择项目后，将按文件名和上一级文件夹归类环境。</div>}
        </div>
      </aside>

      <main className="projecttasks-detail projectconfigs-editor">
        {loaded ? (
          <>
            <div className="projectconfigs-editor-header">
              <div>
                <h2>{loaded.path}</h2>
                <p>{loaded.environmentLabel} · {environmentSourceLabel(selectedFile?.environmentSource ?? "common")} · {loaded.format.toUpperCase()}</p>
              </div>
              <div className="projectconfigs-actions">
                {selectedFile && (
                  <button
                    type="button"
                    data-favorite={selectedFavorite}
                    onClick={() => toggleFavorite(root, selectedFile)}
                    title={selectedFavorite ? "取消收藏" : "收藏并置顶"}
                  >
                    <FavoriteIcon size={13} filled={selectedFavorite} decorative />
                    {selectedFavorite ? "已收藏" : "收藏"}
                  </button>
                )}
                {loaded.sensitiveCount > 0 && !editing && (
                  <button type="button" onClick={() => setShowSensitive((value) => !value)}>{showSensitive ? "隐藏敏感值" : "显示敏感值"}</button>
                )}
                {!editing ? (
                  <button type="button" onClick={() => { setEditing(true); setShowSensitive(true); setSavePreview(false); }}>编辑原文</button>
                ) : (
                  <>
                    <button type="button" onClick={() => { setEditorContent(loaded.content); setEditing(false); setShowSensitive(false); setSavePreview(false); }}>放弃修改</button>
                    <button className="primary" type="button" onClick={() => void previewSave()} disabled={!changed || busy}>检查并保存</button>
                  </>
                )}
              </div>
            </div>
            {loaded.sensitiveCount > 0 && !showSensitive && !editing && (
              <div className="projectconfigs-sensitive-note">已隐藏 {loaded.sensitiveCount} 个可能的密码、Token 或密钥字段。</div>
            )}
            {editing ? (
              <textarea className="projectconfigs-textarea" spellCheck={false} value={editorContent} onChange={(event) => { setEditorContent(event.target.value); setSavePreview(false); }} />
            ) : (
              <pre className="projectconfigs-preview">{showSensitive ? loaded.content : loaded.maskedContent}</pre>
            )}
            <div className="projectconfigs-status">{status}</div>
          </>
        ) : (
          <div className="projectconfigs-empty">
            <FileIcon size={30} decorative />
            <strong>选择配置文件</strong>
            <span>{status}</span>
          </div>
        )}
      </main>

      {savePreview && loaded && (
        <div className="projectconfigs-save-backdrop">
          <section className="projectconfigs-save-dialog" role="dialog" aria-modal="true" aria-label="确认配置差异">
            <header>
              <div><strong>确认配置差异</strong><span>{loaded.path}</span></div>
              <button type="button" onClick={() => setSavePreview(false)} disabled={busy}>关闭</button>
            </header>
            <div className="projectconfigs-diff">
              <div><b>保存前（敏感值已隐藏）</b><pre>{loaded.maskedContent}</pre></div>
              <div><b>保存后（敏感值已隐藏）</b><pre>{pendingMaskedContent}</pre></div>
            </div>
            {production && (
              <label className="projectconfigs-production-confirm">
                <input type="checkbox" checked={productionConfirmed} onChange={(event) => setProductionConfirmed(event.target.checked)} />
                我确认正在修改线上环境配置
              </label>
            )}
            <footer>
              <span>{production ? "线上配置需要额外确认" : "保存会原子替换原文件"}</span>
              <div>
                <button type="button" onClick={() => setSavePreview(false)} disabled={busy}>返回编辑</button>
                <button className="primary" type="button" onClick={() => void confirmSave()} disabled={busy || (production && !productionConfirmed)}>
                  <CheckIcon size={13} decorative />确认保存
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
