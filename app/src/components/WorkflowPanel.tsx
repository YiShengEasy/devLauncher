import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { CSSProperties, ReactNode } from "react";
import {
  cancelWorkflowRun,
  completionLabel,
  confirmWorkflowStep,
  conditionLabel,
  createWorkflow,
  createWorkflowStep,
  defaultCompletionForAction,
  listWorkflowRuns,
  runWorkflow,
  validateWorkflow,
} from "@/api/workflow";
import {
  createWorkflowFromTemplate,
  listWorkflowTemplates,
  matchingOfficialTemplateId,
  WORKFLOW_TEMPLATE_CATEGORY_LABELS,
} from "@/api/workflowTemplates";
import { BindingModal } from "@/components/BindingModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ActionIcon } from "@/components/ActionIcon";
import { planTerminalChunk } from "@/components/workflowTerminal";
import {
  AddIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DeleteIcon,
  MoveDownIcon,
  MoveUpIcon,
  WorkflowIcon,
} from "@/icons";
import type {
  Action,
  CompletionRule,
  KeyboardConfig,
  ScriptAction,
  StepCondition,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
} from "@/types/actions";
import { ACTION_TYPE_META } from "@/types/actions";
import "@xterm/xterm/css/xterm.css";

const PANEL: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  color: "rgba(244,247,255,0.9)",
};

const INPUT: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 34,
  boxSizing: "border-box",
  padding: "0 9px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.055)",
  color: "rgba(248,250,255,0.9)",
  outline: "none",
  fontSize: 12,
  colorScheme: "dark",
};

const TEXTAREA: CSSProperties = {
  ...INPUT,
  height: 68,
  padding: "8px 9px",
  resize: "vertical",
  lineHeight: 1.45,
};

const BUTTON: CSSProperties = {
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "0 10px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(245,248,255,0.78)",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const ICON_BUTTON: CSSProperties = {
  ...BUTTON,
  width: 30,
  padding: 0,
};

const LABEL: CSSProperties = {
  display: "block",
  marginBottom: 5,
  color: "rgba(226,232,244,0.54)",
  fontSize: 10,
  fontWeight: 650,
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={LABEL}>{label}</label>
      {children}
    </div>
  );
}

function defaultCondition(type: StepCondition["type"]): StepCondition {
  switch (type) {
    case "previous_success": return { type };
    case "previous_failed": return { type };
    case "platform": return { type, platform: "macos" };
    case "path_exists": return { type, path: "" };
    case "env_equals": return { type, name: "", value: "" };
    default: return { type: "always" };
  }
}

function defaultCompletion(type: CompletionRule["type"]): CompletionRule {
  switch (type) {
    case "process_started":
      return { type, stabilizationMs: 800, timeoutMs: 15_000 };
    case "process_exit":
      return { type, successCodes: [0], timeoutMs: 120_000 };
    case "port_ready":
      return { type, host: "127.0.0.1", port: 3000, intervalMs: 500, timeoutMs: 30_000 };
    case "timer":
      return { type, durationMs: 1_000 };
    case "manual":
      return { type };
    case "window_ready":
      return { type, titleContains: "", timeoutMs: 15_000 };
    case "url_ready":
      return { type, urlPattern: "https://", timeoutMs: 30_000 };
    case "connection_ready":
      return { type, timeoutMs: 15_000 };
    default:
      return { type: "action_resolved" };
  }
}

function statusColor(status?: WorkflowRun["status"]): string {
  if (status === "succeeded") return "#34d399";
  if (status === "failed") return "#f87171";
  if (status === "cancelled") return "#fbbf24";
  if (status === "running" || status === "waiting") return "#60a5fa";
  return "rgba(255,255,255,0.38)";
}

function runStatusLabel(status: WorkflowRun["status"]): string {
  switch (status) {
    case "pending": return "准备中";
    case "running": return "执行中";
    case "waiting": return "等待中";
    case "succeeded": return "已完成";
    case "failed": return "失败";
    case "cancelled": return "已取消";
  }
}

function stepStatusLabel(status: WorkflowRun["steps"][number]["status"]): string {
  switch (status) {
    case "pending": return "待执行";
    case "running": return "执行中";
    case "waiting": return "等待中";
    case "succeeded": return "已完成";
    case "failed": return "失败";
    case "skipped": return "已跳过";
    case "cancelled": return "已取消";
  }
}

function runSummaryDetail(run: WorkflowRun): string | undefined {
  const failedStep = run.steps.find((step) => step.status === "failed");
  if (failedStep) {
    return `失败步骤：${failedStep.name}`;
  }
  return run.message;
}

const ANSI_ESCAPE_PATTERN = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const SPINNER_ONLY_PATTERN = /^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+$/;

function cleanTerminalText(text: string): string {
  return text
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.split("\r").at(-1) ?? "")
    .filter((line) => !SPINNER_ONLY_PATTERN.test(line))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd();
}

function formatRunLog(run: WorkflowRun): string {
  const summaryDetail = runSummaryDetail(run);
  const lines = [
    `工作流：${run.workflowName}`,
    `状态：${runStatusLabel(run.status)}`,
    ...(summaryDetail ? [`详情：${summaryDetail}`] : []),
    "",
    ...run.steps.map((step, index) => (
      `${String(index + 1).padStart(2, "0")} [${stepStatusLabel(step.status)}] ${step.name}`
      + (step.message ? `\n${step.message}` : "")
      + (step.output ? `\n${step.output}` : "")
    )),
  ];
  return cleanTerminalText(lines.join("\n"));
}

function isRunActive(run: WorkflowRun | null | undefined): boolean {
  return Boolean(run && (run.status === "pending" || run.status === "running" || run.status === "waiting"));
}

function workflowTerminalSession(run: WorkflowRun | null): string | null {
  if (!run) return null;
  const current = run.currentStepId
    ? run.steps.find((step) => step.stepId === run.currentStepId)
    : null;
  return current?.terminalSessionId
    ?? [...run.steps].reverse().find((step) => step.terminalSessionId)?.terminalSessionId
    ?? null;
}

function terminalBufferText(term: Terminal): string {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let index = 0; index < buffer.length; index += 1) {
    const line = buffer.getLine(index);
    if (!line) continue;
    const text = line.translateToString(true);
    if (line.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += text;
    } else {
      lines.push(text);
    }
  }
  return cleanTerminalText(lines.join("\n"));
}

interface WorkflowRunTerminalHandle {
  getText: () => string;
}

interface TerminalDataChunk {
  offset: number;
  data: string;
}

interface TerminalSnapshot {
  data: string;
  offset: number;
  active: boolean;
}

function decodeTerminalBytes(data: string): Uint8Array {
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
}

const WorkflowRunTerminal = forwardRef<WorkflowRunTerminalHandle, { run: WorkflowRun | null }>(
function WorkflowRunTerminal({ run }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const seenStepIdsRef = useRef(new Set<string>());
  const seenExitSessionsRef = useRef(new Set<string>());
  const sessionOffsetsRef = useRef(new Map<string, number>());
  const sessionId = workflowTerminalSession(run);

  useImperativeHandle(ref, () => ({
    getText: () => termRef.current ? terminalBufferText(termRef.current) : "",
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    container.innerHTML = "";
    const term = new Terminal({
      fontSize: 10,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      theme: {
        background: "#100b12",
        foreground: "#d7d1dc",
        cursor: "#5fd7ff",
        cursorAccent: "#100b12",
        selectionBackground: "rgba(255,255,255,0.2)",
        red: "#ff6b7a",
        green: "#5fffaf",
        yellow: "#ffd166",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e5e7eb",
        brightBlack: "#6b7280",
        brightWhite: "#ffffff",
      },
      cursorBlink: false,
      disableStdin: true,
      allowTransparency: true,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;
    seenStepIdsRef.current.clear();
    seenExitSessionsRef.current.clear();
    sessionOffsetsRef.current.clear();
    if (run) {
      term.write(`\x1b[36m$ ${run.workflowName}\x1b[0m\r\n`);
      for (const [index, runStep] of run.steps.entries()) {
        const completed = runStep.status === "succeeded"
          || runStep.status === "failed"
          || runStep.status === "skipped"
          || runStep.status === "cancelled";
        if (!completed || (!runStep.output && !runStep.message)) continue;
        seenStepIdsRef.current.add(runStep.stepId);
        term.write(`\r\n\x1b[90m$ step ${String(index + 1).padStart(2, "0")} · ${runStep.name}\x1b[0m\r\n`);
        const output = cleanTerminalText(
          runStep.terminalSessionId === sessionId
            ? runStep.message || ""
            : runStep.output || runStep.message || "",
        );
        if (output) term.write(`${output.replace(/\n/g, "\r\n")}\r\n`);
      }
    }
    const resize = () => {
      fitAddon.fit();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    window.setTimeout(resize, 0);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [run?.id]);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !run?.currentStepId || seenStepIdsRef.current.has(run.currentStepId)) return;
    const index = run.steps.findIndex((step) => step.stepId === run.currentStepId);
    const current = run.steps[index];
    if (!current) return;
    seenStepIdsRef.current.add(current.stepId);
    term.write(`\r\n\x1b[90m$ step ${String(index + 1).padStart(2, "0")} · ${current.name}\x1b[0m\r\n`);
  }, [run?.currentStepId, run?.id, run?.steps]);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !sessionId) return undefined;
    let disposed = false;
    let initialized = false;
    let syncing = false;
    const pending: TerminalDataChunk[] = [];
    const disposers: Array<() => void> = [];

    const markExited = () => {
      if (seenExitSessionsRef.current.has(sessionId)) return;
      seenExitSessionsRef.current.add(sessionId);
      term.write("\r\n\x1b[90m[步骤进程已退出]\x1b[0m\r\n");
    };
    const appendChunk = (chunk: TerminalDataChunk) => {
      const bytes = decodeTerminalBytes(chunk.data);
      const currentOffset = sessionOffsetsRef.current.get(sessionId) ?? 0;
      const plan = planTerminalChunk(currentOffset, chunk.offset, bytes.length);
      if (plan.gap) {
        pending.push(chunk);
        void syncSnapshot();
        return;
      }
      if (plan.skipBytes < bytes.length) term.write(bytes.slice(plan.skipBytes));
      sessionOffsetsRef.current.set(sessionId, plan.nextOffset);
    };
    const flushPending = () => {
      pending.sort((left, right) => left.offset - right.offset);
      const chunks = pending.splice(0);
      chunks.forEach(appendChunk);
    };
    const syncSnapshot = async (attempt = 0): Promise<void> => {
      if (disposed || syncing) return;
      syncing = true;
      try {
        const snapshot = await invoke<TerminalSnapshot>("terminal_snapshot", { sessionId });
        if (disposed) return;
        appendChunk({ offset: 0, data: snapshot.data });
        sessionOffsetsRef.current.set(
          sessionId,
          Math.max(sessionOffsetsRef.current.get(sessionId) ?? 0, snapshot.offset),
        );
        if (!snapshot.active) markExited();
      } catch {
        if (attempt < 5 && !disposed) {
          await new Promise((resolve) => window.setTimeout(resolve, 40));
          syncing = false;
          return syncSnapshot(attempt + 1);
        }
      } finally {
        syncing = false;
      }
      if (!disposed) flushPending();
    };

    void Promise.all([
      listen<TerminalDataChunk>(`terminal-data-v2-${sessionId}`, (event) => {
        if (!initialized) {
          pending.push(event.payload);
          return;
        }
        appendChunk(event.payload);
      }),
      listen(`terminal-exit-${sessionId}`, markExited),
    ]).then((listeners) => {
      if (disposed) {
        listeners.forEach((dispose) => dispose());
        return;
      }
      disposers.push(...listeners);
      void syncSnapshot().finally(() => {
        initialized = true;
        flushPending();
      });
    });

    return () => {
      disposed = true;
      disposers.forEach((dispose) => dispose());
    };
  }, [sessionId, run?.id]);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !run || isRunActive(run)) return;
    const color = run.status === "succeeded" ? "32" : run.status === "failed" ? "31" : "33";
    term.write(`\r\n\x1b[${color}m[工作流${runStatusLabel(run.status)}]\x1b[0m\r\n`);
  }, [run?.id, run?.status]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        boxSizing: "border-box",
        padding: "7px 8px",
        borderRadius: 7,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}
    />
  );
});

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export function WorkflowPanel({
  config,
  onSaveConfig,
  onClose,
  initialRun,
}: {
  config: KeyboardConfig;
  onSaveConfig: (config: KeyboardConfig) => Promise<void>;
  onClose: () => void;
  initialRun?: WorkflowRun;
}) {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(() => structuredClone(config.workflows ?? []));
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    config.workflows?.[0]?.id ?? null,
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    config.workflows?.[0]?.steps[0]?.id ?? null,
  );
  const [editingStep, setEditingStep] = useState<WorkflowStep | "new" | null>(null);
  const [status, setStatus] = useState("");
  const [run, setRun] = useState<WorkflowRun | null>(initialRun ?? null);
  const [runPanelOpen, setRunPanelOpen] = useState(Boolean(initialRun));
  const [runLogCopied, setRunLogCopied] = useState(false);
  const runTerminalRef = useRef<WorkflowRunTerminalHandle>(null);
  const [manualRequest, setManualRequest] = useState<{ runId: string; stepId: string; stepName: string } | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [workflowQuery, setWorkflowQuery] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const workflowTemplates = useMemo(() => listWorkflowTemplates(), []);

  const workflow = workflows.find((item) => item.id === selectedWorkflowId) ?? null;
  const step = workflow?.steps.find((item) => item.id === selectedStepId) ?? null;
  const customWorkflows = useMemo(
    () => workflows.filter((item) => !matchingOfficialTemplateId(item)),
    [workflows],
  );
  const visibleWorkflows = useMemo(() => {
    const query = workflowQuery.trim().toLocaleLowerCase();
    if (!query) return customWorkflows;
    return customWorkflows.filter((item) => (
      item.name.toLocaleLowerCase().includes(query)
      || item.description.toLocaleLowerCase().includes(query)
    ));
  }, [customWorkflows, workflowQuery]);
  const monitorWorkflows = useMemo(() => customWorkflows.filter((item) => {
    const text = `${item.name} ${item.description}`.toLocaleLowerCase();
    return text.includes("监控") || text.includes("monitor") || text.includes("health");
  }), [customWorkflows]);
  const completedRunSteps = run?.steps.filter((item) => (
    item.status === "succeeded"
    || item.status === "failed"
    || item.status === "skipped"
    || item.status === "cancelled"
  )).length ?? 0;
  const runProgress = run?.steps.length
    ? Math.round((completedRunSteps / run.steps.length) * 100)
    : 0;
  const runningBlocked = isRunActive(run);

  useEffect(() => {
    const nextWorkflows = structuredClone(config.workflows ?? []);
    setWorkflows(nextWorkflows);
    setSelectedWorkflowId((current) => (
      current && nextWorkflows.some((item) => item.id === current)
        ? current
        : nextWorkflows[0]?.id ?? null
    ));
    setSelectedStepId((current) => {
      if (current && nextWorkflows.some((item) => item.steps.some((entry) => entry.id === current))) {
        return current;
      }
      return nextWorkflows[0]?.steps[0]?.id ?? null;
    });
    setDirty(false);
  }, [config.revision, config.workflows]);

  useEffect(() => {
    let disposeStatus: (() => void) | null = null;
    let disposeManual: (() => void) | null = null;
    listWorkflowRuns().then((runs) => {
      const active = runs.find((item) => isRunActive(item));
      const latest = active ?? runs[runs.length - 1];
      if (latest) {
        setRun(latest);
        if (isRunActive(latest)) setRunPanelOpen(true);
      }
    }).catch(() => undefined);
    listen<WorkflowRun>("workflow-run-status", (event) => {
      setRun((current) => (
        !current || current.id === event.payload.id || isRunActive(event.payload)
          ? event.payload
          : current
      ));
    }).then((dispose) => {
      disposeStatus = dispose;
    }).catch(console.error);
    listen<{ runId: string; stepId: string; stepName: string }>(
      "workflow-manual-confirmation-required",
      (event) => setManualRequest(event.payload),
    ).then((dispose) => {
      disposeManual = dispose;
    }).catch(console.error);
    return () => {
      disposeStatus?.();
      disposeManual?.();
    };
  }, []);

  const updateWorkflow = (patch: Partial<WorkflowDefinition>) => {
    if (!workflow) return;
    setDirty(true);
    setWorkflows((items) => items.map((item) => (
      item.id === workflow.id
        ? { ...item, ...patch, updatedAt: new Date().toISOString() }
        : item
    )));
  };

  const updateStep = (patch: Partial<WorkflowStep>) => {
    if (!workflow || !step) return;
    updateWorkflow({
      steps: workflow.steps.map((item) => item.id === step.id ? { ...item, ...patch } : item),
    });
  };

  const updateStepAction = (action: Action) => {
    updateStep({ action, name: action.name });
  };

  const persist = async (
    nextWorkflows = workflows,
    nextPages = config.pages,
  ): Promise<boolean> => {
    const current = nextWorkflows.find((item) => item.id === selectedWorkflowId);
    if (current) {
      const report = await validateWorkflow(current);
      if (!report.valid) {
        setStatus(report.errors.join("；"));
        return false;
      }
      if (report.warnings.length) setStatus(report.warnings.join("；"));
    }
    const nextConfig: KeyboardConfig = {
      ...config,
      schemaVersion: 2,
      revision: (config.revision ?? 0) + 1,
      pages: nextPages,
      workflows: nextWorkflows,
    };
    await onSaveConfig(nextConfig);
    setDirty(false);
    setStatus("工作流已保存");
    return true;
  };

  const createNewWorkflow = () => {
    const next = createWorkflow();
    setDirty(true);
    setWorkflows((items) => [...items, next]);
    setSelectedWorkflowId(next.id);
    setSelectedStepId(null);
    setStatus("已创建草稿，保存后生效");
  };

  const createTemplateWorkflow = (templateId: string) => {
    try {
      const existing = workflows.find((item) => matchingOfficialTemplateId(item) === templateId);
      if (existing) {
        setSelectedWorkflowId(existing.id);
        setSelectedStepId(existing.steps[0]?.id ?? null);
        setStatus("已打开官方模板；修改后会显示在自定义工作流中");
        return;
      }
      const next = createWorkflowFromTemplate(templateId);
      setDirty(true);
      setWorkflows((items) => [...items, next]);
      setSelectedWorkflowId(next.id);
      setSelectedStepId(next.steps[0]?.id ?? null);
      setStatus("已从模板创建草稿，请先调整路径、端口或命令后保存");
    } catch (error) {
      setStatus(String(error));
    }
  };

  const duplicateWorkflow = () => {
    if (!workflow) return;
    const now = new Date().toISOString();
    const copy: WorkflowDefinition = {
      ...structuredClone(workflow),
      id: createWorkflow().id,
      name: `${workflow.name} 副本`,
      steps: workflow.steps.map((item) => ({
        ...structuredClone(item),
        id: createWorkflowStep(item.action).id,
      })),
      createdAt: now,
      updatedAt: now,
    };
    setDirty(true);
    setWorkflows((items) => [...items, copy]);
    setSelectedWorkflowId(copy.id);
    setSelectedStepId(copy.steps[0]?.id ?? null);
  };

  const deleteWorkflow = () => {
    if (!workflow) return;
    setConfirmRequest({
      title: "删除工作流",
      message: `将删除“${workflow.name}”。已有键盘绑定会在保存时一并移除。`,
      confirmLabel: "删除工作流",
      onConfirm: () => {
        const next = workflows.filter((item) => item.id !== workflow.id);
        const nextPages = config.pages.map((page) => ({
          ...page,
          keys: Object.fromEntries(
            Object.entries(page.keys).filter(([, binding]) => {
              const action = binding?.action;
              return action?.type !== "workflow" || action.workflowId !== workflow.id;
            }),
          ),
        }));
        setDirty(true);
        setWorkflows(next);
        setSelectedWorkflowId(next[0]?.id ?? null);
        setSelectedStepId(next[0]?.steps[0]?.id ?? null);
        setConfirmRequest(null);
        void persist(next, nextPages);
      },
    });
  };

  const saveStepAction = (action: Action) => {
    if (!workflow) return;
    if (editingStep === "new") {
      const nextStep = createWorkflowStep(action);
      updateWorkflow({ steps: [...workflow.steps, nextStep] });
      setSelectedStepId(nextStep.id);
    } else if (editingStep) {
      updateWorkflow({
        steps: workflow.steps.map((item) => item.id === editingStep.id
          ? {
              ...item,
              name: action.name,
              action,
              completion: defaultCompletionForAction(action),
            }
          : item),
      });
    }
    setEditingStep(null);
  };

  const moveStep = (direction: -1 | 1) => {
    if (!workflow || !step) return;
    const index = workflow.steps.findIndex((item) => item.id === step.id);
    const target = index + direction;
    if (target < 0 || target >= workflow.steps.length) return;
    const steps = [...workflow.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    updateWorkflow({ steps });
  };

  const deleteStep = () => {
    if (!workflow || !step) return;
    const index = workflow.steps.findIndex((item) => item.id === step.id);
    const steps = workflow.steps.filter((item) => item.id !== step.id);
    updateWorkflow({ steps });
    setSelectedStepId(steps[Math.min(index, steps.length - 1)]?.id ?? null);
  };

  const startWorkflowRun = async (workflowId: string) => {
    try {
      if (dirty && !await persist()) return;
      const started = await runWorkflow(workflowId);
      setRun(started);
      setRunPanelOpen(true);
      setStatus("工作流已开始运行");
    } catch (error) {
      setStatus(String(error));
    }
  };

  const startRun = async () => {
    if (!workflow) return;
    await startWorkflowRun(workflow.id);
  };

  const copyRunLog = async () => {
    if (!run) return;
    const text = runTerminalRef.current?.getText() || formatRunLog(run);
    try {
      const isTauriRuntime = Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
      if (isTauriRuntime) {
        await invoke("set_clipboard_text", { text, suppressHistory: true });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) {
        setStatus("复制运行日志失败");
        return;
      }
    }
    setRunLogCopied(true);
    window.setTimeout(() => setRunLogCopied(false), 1600);
  };

  return (
    <div style={PANEL}>
      <div style={{
        height: 56,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 14px",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        cursor: "default",
      }}
      data-tauri-drag-region
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          event.button === 0
          && !target.closest("button, input, textarea, select, [data-no-window-drag]")
        ) {
          getCurrentWindow().startDragging().catch(console.error);
        }
      }}
      >
        <strong style={{ fontSize: 12, color: "rgba(255,255,255,0.48)" }}>自动化</strong>
        <span style={{ color: "rgba(255,255,255,0.24)", fontSize: 15 }}>›</span>
        <WorkflowIcon size={17} decorative />
        <strong style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
          {workflow?.name || "工作流编排器"}
        </strong>
        <div data-no-window-drag style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
          <button style={BUTTON} onClick={() => void persist()} disabled={!workflow}>
            <CheckIcon size={14} decorative />
            保存
          </button>
          <button
            style={{ ...BUTTON, background: "rgba(52,211,153,0.16)", borderColor: "rgba(52,211,153,0.3)" }}
            onClick={() => void startRun()}
            disabled={!workflow || runningBlocked}
          >
            运行
          </button>
          <button style={ICON_BUTTON} onClick={onClose} title="关闭工作流" aria-label="关闭工作流">
            <CloseIcon size={15} decorative />
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "clamp(190px, 18vw, 224px) minmax(400px, 1fr) clamp(280px, 26vw, 320px)",
        }}
      >
        <aside style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.09)", overflow: "hidden" }}>
          <div style={{ flexShrink: 0, padding: "13px 12px 8px" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ fontSize: 11 }}>工作流</strong>
              <span style={{ marginLeft: 5, color: "rgba(255,255,255,0.34)", fontSize: 9 }}>{customWorkflows.length} 个</span>
            </div>
            <input
              style={{ ...INPUT, height: 34 }}
              value={workflowQuery}
              onChange={(event) => setWorkflowQuery(event.target.value)}
              placeholder="搜索工作流"
              aria-label="搜索工作流"
            />
          </div>
          <div style={{ flexShrink: 0, padding: "0 8px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <button
              type="button"
              onClick={() => setTemplatesOpen((open) => !open)}
              style={{ width: "100%", display: "flex", alignItems: "center", margin: "0 0 7px", padding: "2px 4px", border: 0, background: "transparent", color: "inherit", cursor: "pointer", textAlign: "left" }}
              aria-expanded={templatesOpen}
            >
              <span style={{ width: 14, color: "rgba(255,255,255,0.36)" }}>{templatesOpen ? "⌃" : "⌄"}</span>
              <strong style={{ color: "rgba(255,255,255,0.48)", fontSize: 10 }}>官方模板</strong>
              <span style={{ marginLeft: 5, color: "rgba(255,255,255,0.28)", fontSize: 9 }}>{workflowTemplates.length} 个</span>
            </button>
            {templatesOpen && (
            <div style={{ display: "grid", gap: 6, maxHeight: 168, overflow: "auto", paddingRight: 2 }}>
              {workflowTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => createTemplateWorkflow(template.id)}
                  style={{
                    width: "100%",
                    minHeight: 50,
                    padding: "8px 9px",
                    borderRadius: 7,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.035)",
                    color: "rgba(245,247,255,0.82)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  title={template.description}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{
                      flexShrink: 0,
                      padding: "2px 5px",
                      borderRadius: 4,
                      background: template.category === "monitor" ? "rgba(45,212,191,0.1)" : "rgba(96,165,250,0.1)",
                      color: template.category === "monitor" ? "rgba(94,234,212,0.78)" : "rgba(147,197,253,0.78)",
                      fontSize: 8,
                      fontWeight: 750,
                    }}>
                      {WORKFLOW_TEMPLATE_CATEGORY_LABELS[template.category]}
                    </span>
                    <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>
                      {template.name}
                    </strong>
                  </span>
                  <span style={{ display: "block", marginTop: 5, color: "rgba(255,255,255,0.34)", fontSize: 9 }}>
                    {template.stepCount} 步 · 生成后可编辑
                  </span>
                </button>
              ))}
            </div>
            )}
          </div>
          <div style={{ flexShrink: 0, padding: "8px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <button
              type="button"
              onClick={() => setMonitorOpen((open) => !open)}
              style={{ width: "100%", display: "flex", alignItems: "center", margin: 0, padding: "2px 4px", border: 0, background: "transparent", color: "inherit", cursor: "pointer", textAlign: "left" }}
              aria-expanded={monitorOpen}
            >
              <span style={{ width: 14, color: "rgba(255,255,255,0.36)" }}>{monitorOpen ? "⌃" : "⌄"}</span>
              <strong style={{ color: "rgba(255,255,255,0.48)", fontSize: 10 }}>监控 Dashboard</strong>
              <span style={{ marginLeft: 5, color: "rgba(255,255,255,0.28)", fontSize: 9 }}>{monitorWorkflows.length} 个</span>
            </button>
            {monitorOpen && (
            <div style={{
              marginTop: 7,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 7,
              background: "rgba(255,255,255,0.03)",
              padding: 9,
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 8 }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.34)", fontSize: 9 }}>最近状态</div>
                  <strong style={{ color: statusColor(run?.status), fontSize: 12 }}>
                    {run ? runStatusLabel(run.status) : "未运行"}
                  </strong>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.34)", fontSize: 9 }}>进度</div>
                  <strong style={{ color: "rgba(245,247,255,0.82)", fontSize: 12 }}>{run ? `${runProgress}%` : "-"}</strong>
                </div>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {monitorWorkflows.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => void startWorkflowRun(item.id)}
                    disabled={runningBlocked}
                    style={{
                      ...BUTTON,
                      justifyContent: "space-between",
                      width: "100%",
                      height: 30,
                      padding: "0 8px",
                      background: "rgba(45,212,191,0.08)",
                      borderColor: "rgba(45,212,191,0.18)",
                    }}
                    title={item.description}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                    <span style={{ color: "rgba(94,234,212,0.76)" }}>运行</span>
                  </button>
                ))}
                {!monitorWorkflows.length && (
                  <div style={{ color: "rgba(255,255,255,0.34)", fontSize: 10, lineHeight: 1.6 }}>
                    从“官方模板”创建本地服务监控后会出现在这里。
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 8 }}>
            {visibleWorkflows.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedWorkflowId(item.id);
                  setSelectedStepId(item.steps[0]?.id ?? null);
                }}
                style={{
                  width: "100%",
                  minHeight: 58,
                  marginBottom: 6,
                  padding: "9px 10px",
                  borderRadius: 7,
                  border: item.id === selectedWorkflowId
                    ? "1px solid rgba(96,165,250,0.4)"
                    : "1px solid transparent",
                  background: item.id === selectedWorkflowId
                    ? "rgba(59,130,246,0.12)"
                    : "transparent",
                  color: "rgba(245,247,255,0.85)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 700 }}>
                  {item.name}
                </span>
                <span style={{ display: "block", marginTop: 6, color: "rgba(255,255,255,0.36)", fontSize: 9 }}>
                  {item.steps.filter((entry) => entry.enabled).length} 个启用步骤
                  {item.enabled ? "" : " · 已停用"}
                </span>
              </button>
            ))}
          </div>
          <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 30px 30px", gap: 6, padding: 8, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
            <button style={BUTTON} onClick={createNewWorkflow}>
              <AddIcon size={13} decorative />
              新建
            </button>
            <button style={ICON_BUTTON} onClick={duplicateWorkflow} disabled={!workflow} title="复制工作流" aria-label="复制工作流">
              <CopyIcon size={13} decorative />
            </button>
            <button style={ICON_BUTTON} onClick={deleteWorkflow} disabled={!workflow} title="删除工作流" aria-label="删除工作流">
              <DeleteIcon size={13} decorative />
            </button>
          </div>
        </aside>

        <main style={{ minWidth: 0, minHeight: 0, overflow: "auto", padding: "18px 22px" }}>
          {!workflow ? (
            <div style={{ display: "grid", placeItems: "center", height: "100%", color: "rgba(255,255,255,0.34)", fontSize: 11 }}>
              新建一个工作流开始编排
            </div>
          ) : (
            <>
              <input
                aria-label="工作流名称"
                style={{
                  ...INPUT,
                  height: 38,
                  padding: 0,
                  border: 0,
                  background: "transparent",
                  fontSize: 22,
                  fontWeight: 780,
                }}
                value={workflow.name}
                onChange={(event) => updateWorkflow({ name: event.target.value })}
              />
              <textarea
                aria-label="工作流说明"
                placeholder="添加工作流说明"
                style={{
                  ...TEXTAREA,
                  height: 48,
                  minHeight: 48,
                  marginBottom: 10,
                  padding: "4px 0",
                  border: 0,
                  background: "transparent",
                  color: "rgba(226,232,244,0.56)",
                  resize: "none",
                }}
                value={workflow.description}
                onChange={(event) => updateWorkflow({ description: event.target.value })}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <Field label="失败后">
                  <select style={INPUT} value={workflow.failurePolicy} onChange={(event) => updateWorkflow({ failurePolicy: event.target.value as WorkflowDefinition["failurePolicy"] })}>
                    <option value="stop">停止执行</option>
                    <option value="continue">继续执行</option>
                  </select>
                </Field>
                <Field label="状态">
                  <select style={INPUT} value={workflow.enabled ? "enabled" : "disabled"} onChange={(event) => updateWorkflow({ enabled: event.target.value === "enabled" })}>
                    <option value="enabled">已启用</option>
                    <option value="disabled">已停用</option>
                  </select>
                </Field>
              </div>

              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: 11 }}>执行步骤</strong>
                <button style={{ ...BUTTON, marginLeft: "auto" }} onClick={() => setEditingStep("new")}>
                  <AddIcon size={13} decorative />
                  添加步骤
                </button>
              </div>
              {workflow.steps.map((item, index) => {
                const stepRun = run?.workflowId === workflow.id
                  ? run.steps.find((entry) => entry.stepId === item.id)
                  : undefined;
                return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedStepId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedStepId(item.id);
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "30px 34px minmax(0,1fr) auto",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 66,
                    marginBottom: 9,
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: item.id === selectedStepId
                      ? "1px solid rgba(96,165,250,0.5)"
                      : "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.035)",
                    opacity: item.enabled ? 1 : 0.52,
                    cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 26,
                    height: 26,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.14)",
                    color: "rgba(226,232,244,0.48)",
                    fontSize: 9,
                    fontWeight: 700,
                  }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <ActionIcon action={item.action} size={28} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                        {item.name}
                      </strong>
                      <span style={{
                        flexShrink: 0,
                        padding: "2px 5px",
                        borderRadius: 4,
                        background: "rgba(96,165,250,0.1)",
                        color: "rgba(147,197,253,0.72)",
                        fontSize: 8,
                      }}>
                        {ACTION_TYPE_META[item.action.type].label}
                      </span>
                    </div>
                    <span style={{ display: "block", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.4)", fontSize: 9 }}>
                      {stepRun
                        ? `${stepStatusLabel(stepRun.status)}${stepRun.message ? ` · ${stepRun.message}` : ""}`
                        : `${conditionLabel(item.condition)} · 完成：${completionLabel(item.completion)}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    <button
                      style={{ ...ICON_BUTTON, width: 24, height: 24 }}
                      onClick={(event) => { event.stopPropagation(); moveStep(-1); }}
                      disabled={index === 0}
                      title="上移"
                      aria-label="上移步骤"
                    >
                      <MoveUpIcon size={13} decorative />
                    </button>
                    <button
                      style={{ ...ICON_BUTTON, width: 24, height: 24 }}
                      onClick={(event) => { event.stopPropagation(); moveStep(1); }}
                      disabled={index === workflow.steps.length - 1}
                      title="下移"
                      aria-label="下移步骤"
                    >
                      <MoveDownIcon size={13} decorative />
                    </button>
                  </div>
                </div>
                );
              })}

            </>
          )}
        </main>

        <aside style={{ minWidth: 0, minHeight: 0, overflow: "auto", padding: 16, borderLeft: "1px solid rgba(255,255,255,0.09)" }}>
          <strong style={{ display: "block", marginBottom: 16, fontSize: 11 }}>步骤属性</strong>
          {!step ? (
            <div style={{ display: "grid", placeItems: "center", height: "100%", color: "rgba(255,255,255,0.34)", textAlign: "center", fontSize: 10, lineHeight: 1.6 }}>
              选择步骤后编辑条件和完成判定
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                <ActionIcon action={step.action} size={32} />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{step.name}</strong>
                  <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 9 }}>{step.action.type}</span>
                </div>
              </div>
              <Field label="步骤名称">
                <input style={INPUT} value={step.name} onChange={(event) => updateStep({ name: event.target.value })} />
              </Field>
              <Field label="动作内容">
                {step.action.type === "script" ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      style={INPUT}
                      value={step.action.name}
                      onChange={(event) => updateStepAction({ ...(step.action as ScriptAction), name: event.target.value })}
                      aria-label="脚本动作名称"
                    />
                    <select
                      style={INPUT}
                      value={step.action.shell}
                      onChange={(event) => updateStepAction({ ...(step.action as ScriptAction), shell: event.target.value as ScriptAction["shell"] })}
                      aria-label="脚本 Shell"
                    >
                      <option value="terminal">Shell</option>
                      <option value="powershell">PowerShell</option>
                      <option value="cmd">CMD</option>
                      <option value="bat">BAT</option>
                      <option value="wsl">WSL</option>
                    </select>
                    <input
                      style={INPUT}
                      value={step.action.file ?? ""}
                      onChange={(event) => updateStepAction({ ...(step.action as ScriptAction), file: event.target.value })}
                      placeholder="脚本文件路径，可选"
                      aria-label="脚本文件路径"
                    />
                    <textarea
                      style={{ ...TEXTAREA, height: 138, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 10 }}
                      value={step.action.content}
                      onChange={(event) => updateStepAction({ ...(step.action as ScriptAction), content: event.target.value })}
                      placeholder="输入脚本内容"
                      aria-label="脚本内容"
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{
                      padding: "8px 9px",
                      borderRadius: 7,
                      border: "1px solid rgba(255,255,255,0.09)",
                      background: "rgba(255,255,255,0.035)",
                      color: "rgba(226,232,244,0.62)",
                      fontSize: 10,
                      lineHeight: 1.5,
                      overflowWrap: "anywhere",
                    }}>
                      {ACTION_TYPE_META[step.action.type].label} · {step.action.name}
                    </div>
                    <button style={BUTTON} onClick={() => setEditingStep(step)}>更换动作</button>
                  </div>
                )}
              </Field>
              <Field label="执行条件">
                <select
                  style={INPUT}
                  value={step.condition.type}
                  onChange={(event) => updateStep({ condition: defaultCondition(event.target.value as StepCondition["type"]) })}
                >
                  <option value="always">始终执行</option>
                  <option value="previous_success">上一步成功</option>
                  <option value="previous_failed">上一步失败</option>
                  <option value="platform">指定系统</option>
                  <option value="path_exists">路径存在</option>
                  <option value="env_equals">环境变量等于</option>
                </select>
              </Field>
              {step.condition.type === "platform" && (
                <Field label="系统">
                  <select style={INPUT} value={step.condition.platform} onChange={(event) => updateStep({ condition: { type: "platform", platform: event.target.value as "macos" | "windows" | "linux" } })}>
                    <option value="macos">macOS</option>
                    <option value="windows">Windows</option>
                    <option value="linux">Linux</option>
                  </select>
                </Field>
              )}
              {step.condition.type === "path_exists" && (
                <Field label="路径">
                  <input style={INPUT} value={step.condition.path} onChange={(event) => updateStep({ condition: { type: "path_exists", path: event.target.value } })} />
                </Field>
              )}
              {step.condition.type === "env_equals" && (
                <>
                  <Field label="变量名">
                    <input style={INPUT} value={step.condition.name} onChange={(event) => updateStep({ condition: { type: "env_equals", name: event.target.value, value: step.condition.type === "env_equals" ? step.condition.value : "" } })} />
                  </Field>
                  <Field label="期望值">
                    <input style={INPUT} value={step.condition.value} onChange={(event) => updateStep({ condition: { type: "env_equals", name: step.condition.type === "env_equals" ? step.condition.name : "", value: event.target.value } })} />
                  </Field>
                </>
              )}

              <Field label="完成判定">
                <select
                  style={INPUT}
                  value={step.completion.type}
                  onChange={(event) => updateStep({ completion: defaultCompletion(event.target.value as CompletionRule["type"]) })}
                >
                  <option value="action_resolved">动作返回</option>
                  <option value="process_started">进程已启动</option>
                  <option value="process_exit">进程退出且成功</option>
                  <option value="port_ready">端口可用</option>
                  <option value="timer">计时结束</option>
                  <option value="manual">人工确认</option>
                </select>
              </Field>
              {step.completion.type === "process_started" && (
                <>
                  <Field label="稳定时长（毫秒）">
                    <input style={INPUT} type="number" min={0} value={step.completion.stabilizationMs} onChange={(event) => updateStep({ completion: { type: "process_started", stabilizationMs: Number(event.target.value), timeoutMs: step.completion.type === "process_started" ? step.completion.timeoutMs : 15_000 } })} />
                  </Field>
                  <Field label="超时时长（毫秒）">
                    <input style={INPUT} type="number" min={1} value={step.completion.timeoutMs} onChange={(event) => updateStep({ completion: { type: "process_started", stabilizationMs: step.completion.type === "process_started" ? step.completion.stabilizationMs : 800, timeoutMs: Number(event.target.value) } })} />
                  </Field>
                </>
              )}
              {step.completion.type === "process_exit" && (
                <>
                  <Field label="成功退出码">
                    <input
                      style={INPUT}
                      value={step.completion.successCodes.join(",")}
                      onChange={(event) => updateStep({
                        completion: {
                          type: "process_exit",
                          successCodes: event.target.value.split(",").map(Number).filter(Number.isFinite),
                          timeoutMs: step.completion.type === "process_exit" ? step.completion.timeoutMs : 120_000,
                        },
                      })}
                    />
                  </Field>
                  <Field label="超时时长（毫秒）">
                    <input style={INPUT} type="number" min={1} value={step.completion.timeoutMs} onChange={(event) => updateStep({ completion: { type: "process_exit", successCodes: step.completion.type === "process_exit" ? step.completion.successCodes : [0], timeoutMs: Number(event.target.value) } })} />
                  </Field>
                </>
              )}
              {step.completion.type === "port_ready" && (
                <>
                  <Field label="主机">
                    <input style={INPUT} value={step.completion.host} onChange={(event) => updateStep({ completion: { type: "port_ready", host: event.target.value, port: step.completion.type === "port_ready" ? step.completion.port : 3000, intervalMs: step.completion.type === "port_ready" ? step.completion.intervalMs : 500, timeoutMs: step.completion.type === "port_ready" ? step.completion.timeoutMs : 30_000 } })} />
                  </Field>
                  <Field label="端口">
                    <input style={INPUT} type="number" min={1} max={65535} value={step.completion.port} onChange={(event) => updateStep({ completion: { type: "port_ready", host: step.completion.type === "port_ready" ? step.completion.host : "127.0.0.1", port: Number(event.target.value), intervalMs: step.completion.type === "port_ready" ? step.completion.intervalMs : 500, timeoutMs: step.completion.type === "port_ready" ? step.completion.timeoutMs : 30_000 } })} />
                  </Field>
                  <Field label="轮询间隔（毫秒）">
                    <input style={INPUT} type="number" min={50} value={step.completion.intervalMs} onChange={(event) => updateStep({ completion: { type: "port_ready", host: step.completion.type === "port_ready" ? step.completion.host : "127.0.0.1", port: step.completion.type === "port_ready" ? step.completion.port : 3000, intervalMs: Number(event.target.value), timeoutMs: step.completion.type === "port_ready" ? step.completion.timeoutMs : 30_000 } })} />
                  </Field>
                  <Field label="超时时长（毫秒）">
                    <input style={INPUT} type="number" min={1} value={step.completion.timeoutMs} onChange={(event) => updateStep({ completion: { type: "port_ready", host: step.completion.type === "port_ready" ? step.completion.host : "127.0.0.1", port: step.completion.type === "port_ready" ? step.completion.port : 3000, intervalMs: step.completion.type === "port_ready" ? step.completion.intervalMs : 500, timeoutMs: Number(event.target.value) } })} />
                  </Field>
                </>
              )}
              {step.completion.type === "timer" && (
                <Field label="等待时长（毫秒）">
                  <input style={INPUT} type="number" min={1} value={step.completion.durationMs} onChange={(event) => updateStep({ completion: { type: "timer", durationMs: Number(event.target.value) } })} />
                </Field>
              )}
              <Field label="执行前延迟（毫秒）">
                <input style={INPUT} type="number" min={0} value={step.delayMs} onChange={(event) => updateStep({ delayMs: Number(event.target.value) })} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 7, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
                {step.action.type === "script" ? (
                  <div style={{ display: "flex", alignItems: "center", color: "rgba(255,255,255,0.34)", fontSize: 10 }}>
                    脚本内容已在上方编辑
                  </div>
                ) : (
                  <button style={BUTTON} onClick={() => setEditingStep(step)}>更换动作</button>
                )}
                <button style={ICON_BUTTON} onClick={deleteStep} title="删除步骤" aria-label="删除步骤">
                  <DeleteIcon size={13} decorative />
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      <section style={{
        height: runPanelOpen ? "min(220px, 36vh)" : 44,
        minHeight: runPanelOpen ? 150 : 44,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderTop: "1px solid rgba(255,255,255,0.09)",
        background: "rgba(10,14,22,0.7)",
        color: "rgba(255,255,255,0.52)",
        fontSize: 10,
      }}>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={runPanelOpen}
          onClick={() => setRunPanelOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setRunPanelOpen((open) => !open);
            }
          }}
          style={{
            minHeight: 43,
            display: "grid",
            gridTemplateColumns: "20px minmax(160px, auto) minmax(90px, 1fr) 50px auto",
            alignItems: "center",
            gap: 9,
            padding: "6px 12px",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <span style={{ display: "grid", placeItems: "center", color: "rgba(255,255,255,0.4)" }}>
            {runPanelOpen ? <MoveDownIcon size={13} decorative /> : <MoveUpIcon size={13} decorative />}
          </span>
          <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(run?.status), flexShrink: 0 }} />
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(239,243,255,0.72)", fontSize: 10 }}>
              {run ? runStatusLabel(run.status) : "等待运行"}
            </strong>
          </span>
          <span style={{ height: 4, overflow: "hidden", borderRadius: 3, background: "rgba(255,255,255,0.08)" }}>
            <span style={{
              display: "block",
              width: `${runProgress}%`,
              height: "100%",
              borderRadius: 3,
              background: statusColor(run?.status),
              transition: "width 160ms ease",
            }} />
          </span>
          <span style={{ textAlign: "right", color: "rgba(255,255,255,0.34)", fontVariantNumeric: "tabular-nums" }}>
            {completedRunSteps} / {run?.steps.length ?? 0}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {run && (
              <button
                type="button"
                style={{ ...BUTTON, height: 28, minWidth: 76 }}
                onClick={(event) => {
                  event.stopPropagation();
                  void copyRunLog();
                }}
                title="复制终端中的全部内容"
              >
                <CopyIcon size={12} decorative />
                {runLogCopied ? "已复制" : "复制日志"}
              </button>
            )}
            {run && (run.status === "running" || run.status === "waiting") && (
              <button
                style={{ ...BUTTON, height: 28 }}
                onClick={(event) => {
                  event.stopPropagation();
                  void cancelWorkflowRun(run.id);
                }}
              >
                停止
              </button>
            )}
          </span>
        </div>

        {(
          <div
            role="log"
            aria-live="polite"
            aria-hidden={!runPanelOpen}
            className="motion-scroll-area"
            style={{
              flex: 1,
              minHeight: 0,
              display: runPanelOpen ? "grid" : "none",
              gridTemplateColumns: "minmax(260px, 0.9fr) minmax(320px, 1.1fr)",
              gap: 10,
              overflow: "hidden",
              padding: "8px 14px 14px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              fontSize: 10,
              lineHeight: 1.55,
            }}
          >
            {run ? (
              <>
                <div style={{ minHeight: 0, overflow: "auto", paddingRight: 4 }}>
                  <div style={{
                    marginBottom: 7,
                    padding: "7px 9px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.035)",
                    color: run.status === "failed" ? "#fca5a5" : "rgba(226,232,244,0.62)",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}>
                    {run.workflowName} · {runStatusLabel(run.status)}
                    {runSummaryDetail(run) ? `\n${runSummaryDetail(run)}` : ""}
                  </div>
                  {run.steps.map((runStep, index) => {
                    const active = run.currentStepId === runStep.stepId;
                    const color = runStep.status === "failed"
                      ? "#f87171"
                      : runStep.status === "succeeded"
                        ? "#34d399"
                        : runStep.status === "running" || runStep.status === "waiting"
                          ? "#60a5fa"
                          : "rgba(255,255,255,0.34)";
                    return (
                      <div
                        key={runStep.stepId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "30px 64px minmax(0, 1fr)",
                          gap: 8,
                          alignItems: "start",
                          padding: "5px 8px",
                          borderLeft: active ? `2px solid ${color}` : "2px solid transparent",
                          background: active ? "rgba(96,165,250,0.055)" : "transparent",
                        }}
                      >
                        <span style={{ color: "rgba(255,255,255,0.25)", fontVariantNumeric: "tabular-nums" }}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span style={{ color }}>{stepStatusLabel(runStep.status)}</span>
                        <span style={{ minWidth: 0, color: "rgba(226,232,244,0.62)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                          {runStep.name}{runStep.message ? ` · ${runStep.message}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <WorkflowRunTerminal ref={runTerminalRef} run={run} />
              </>
            ) : (
              <div style={{ gridColumn: "1 / -1", padding: "8px", color: "rgba(255,255,255,0.34)" }}>
                {status || "运行工作流后，这里会显示逐步骤状态和错误详情。"}
              </div>
            )}
          </div>
        )}
      </section>

      {editingStep && (
        <BindingModal
          keyId={editingStep === "new" ? "步骤" : editingStep.name}
          bindingLabel="工作流步骤"
          initialAction={editingStep === "new" ? null : editingStep.action}
          onClose={() => setEditingStep(null)}
          onSave={saveStepAction}
        />
      )}
      {confirmRequest && (
        <ConfirmDialog
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmLabel={confirmRequest.confirmLabel}
          onConfirm={confirmRequest.onConfirm}
          onCancel={() => setConfirmRequest(null)}
        />
      )}
      {manualRequest && (
        <ConfirmDialog
          title="等待人工确认"
          message={`“${manualRequest.stepName}”完成后继续执行。`}
          confirmLabel="上一步已完成"
          onConfirm={() => {
            void confirmWorkflowStep(manualRequest.runId, manualRequest.stepId);
            setManualRequest(null);
          }}
          onCancel={() => {
            void cancelWorkflowRun(manualRequest.runId);
            setManualRequest(null);
          }}
        />
      )}
    </div>
  );
}
