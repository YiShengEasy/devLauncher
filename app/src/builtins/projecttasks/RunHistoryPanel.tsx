import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  cancelWorkflowRun,
  clearWorkflowRunHistory,
  listWorkflowRuns,
} from "@/api/workflow";
import type { WorkflowRun } from "@/types/actions";

interface RunHistoryPanelProps {
  projectId?: string;
  tauriRuntime: boolean;
}

const ACTIVE_STATUSES = new Set<WorkflowRun["status"]>(["pending", "running", "waiting"]);

function statusLabel(status: WorkflowRun["status"]): string {
  switch (status) {
    case "pending": return "准备中";
    case "running": return "执行中";
    case "waiting": return "等待中";
    case "succeeded": return "已完成";
    case "failed": return "失败";
    case "cancelled": return "已取消";
    case "interrupted": return "已中断";
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

function formatTime(timestamp?: number): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function durationLabel(run: WorkflowRun): string {
  const end = run.finishedAt ?? (ACTIVE_STATUSES.has(run.status) ? Date.now() : run.startedAt);
  const seconds = Math.max(0, Math.round((end - run.startedAt) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

export function RunHistoryPanel({ projectId, tauriRuntime }: RunHistoryPanelProps) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [scope, setScope] = useState<"current" | "all">(projectId ? "current" : "all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "succeeded" | "failed">("all");
  const [triggerFilter, setTriggerFilter] = useState<"all" | WorkflowRun["trigger"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!tauriRuntime) return;
    try {
      const next = await listWorkflowRuns();
      setRuns(next);
      setSelectedId((current) => (
        current && next.some((run) => run.id === current)
          ? current
          : next.at(-1)?.id ?? null
      ));
      setError("");
    } catch (reason) {
      setError(String(reason));
    }
  };

  useEffect(() => {
    void refresh();
    if (!tauriRuntime) return undefined;
    let dispose: (() => void) | undefined;
    let disposeError: (() => void) | undefined;
    listen<WorkflowRun>("workflow-run-status", ({ payload }) => {
      setRuns((current) => [
        ...current.filter((run) => run.id !== payload.id),
        payload,
      ].sort((left, right) => left.startedAt - right.startedAt));
      setSelectedId((current) => current ?? payload.id);
    }).then((value) => {
      dispose = value;
    }).catch((reason) => setError(String(reason)));
    listen<string>("workflow-run-history-error", ({ payload }) => setError(payload))
      .then((value) => {
        disposeError = value;
      })
      .catch(() => undefined);
    return () => {
      dispose?.();
      disposeError?.();
    };
  }, [tauriRuntime]);

  useEffect(() => {
    if (!projectId && scope === "current") setScope("all");
  }, [projectId, scope]);

  const visibleRuns = useMemo(() => {
    const scoped = scope === "current" && projectId
      ? runs.filter((run) => run.projectId === projectId)
      : runs;
    const triggered = triggerFilter === "all"
      ? scoped
      : scoped.filter((run) => run.trigger === triggerFilter);
    if (statusFilter === "active") return triggered.filter((run) => ACTIVE_STATUSES.has(run.status));
    if (statusFilter === "failed") {
      return triggered.filter((run) => run.status === "failed" || run.status === "interrupted");
    }
    if (statusFilter === "succeeded") return triggered.filter((run) => run.status === "succeeded");
    return triggered;
  }, [projectId, runs, scope, statusFilter, triggerFilter]);
  const selected = visibleRuns.find((run) => run.id === selectedId) ?? visibleRuns.at(-1);

  const clearHistory = async () => {
    if (!tauriRuntime || !window.confirm("清除已结束的运行记录？正在执行的任务会保留。")) return;
    try {
      await clearWorkflowRunHistory();
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const copySummary = async (run: WorkflowRun) => {
    const summary = [
      `工作流：${run.workflowName}`,
      `状态：${statusLabel(run.status)}`,
      `启动：${formatTime(run.startedAt)}`,
      `耗时：${durationLabel(run)}`,
      ...run.steps.map((step, index) => `${index + 1}. [${stepStatusLabel(step.status)}] ${step.name}`),
    ].join("\n");
    if (tauriRuntime) {
      await import("@tauri-apps/api/core").then(({ invoke }) => (
        invoke("set_clipboard_text", { text: summary, suppressHistory: true })
      ));
    } else {
      await navigator.clipboard.writeText(summary);
    }
  };

  return (
    <div className="projectruns-layout">
      <aside className="projectruns-list">
        <div className="projectruns-toolbar">
          <div className="projectruns-scope" role="tablist" aria-label="运行记录范围">
            <button type="button" data-active={scope === "current"} disabled={!projectId} onClick={() => setScope("current")}>当前项目</button>
            <button type="button" data-active={scope === "all"} onClick={() => setScope("all")}>全部</button>
          </div>
          <select className="projectruns-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="运行状态">
            <option value="all">全部状态</option>
            <option value="active">进行中</option>
            <option value="succeeded">已完成</option>
            <option value="failed">失败/中断</option>
          </select>
          <select className="projectruns-filter" value={triggerFilter} onChange={(event) => setTriggerFilter(event.target.value as typeof triggerFilter)} aria-label="启动方式">
            <option value="all">全部启动</option>
            <option value="manual">手动</option>
            <option value="step">单步</option>
            <option value="schedule">定时</option>
          </select>
          <button type="button" className="projectruns-clear" onClick={() => void clearHistory()} disabled={!tauriRuntime || runs.length === 0}>清除</button>
        </div>
        <div className="projecttasks-scroll projectruns-scroll">
          {[...visibleRuns].reverse().map((run) => (
            <button
              type="button"
              className="projectruns-row"
              data-active={selected?.id === run.id}
              data-status={run.status}
              key={run.id}
              onClick={() => setSelectedId(run.id)}
            >
              <span className="projectruns-status-dot" />
              <span className="projectruns-row-copy">
                <strong>{run.workflowName}</strong>
                <small>{formatTime(run.startedAt)} · {durationLabel(run)}</small>
              </span>
              <span className="projectruns-status">{statusLabel(run.status)}</span>
            </button>
          ))}
          {visibleRuns.length === 0 && (
            <div className="projectruns-empty">暂无运行记录。通过“保存为工作流”执行项目任务后，记录会显示在这里。</div>
          )}
        </div>
      </aside>
      <main className="projectruns-detail">
        {selected ? (
          <>
            <header>
              <div>
                <h2>{selected.workflowName}</h2>
                <p>{formatTime(selected.startedAt)} · {durationLabel(selected)}</p>
              </div>
              <div className="projectruns-actions">
                <button type="button" onClick={() => void copySummary(selected)}>复制摘要</button>
                {ACTIVE_STATUSES.has(selected.status) && (
                  <button type="button" data-danger="true" onClick={() => void cancelWorkflowRun(selected.id)}>取消运行</button>
                )}
              </div>
            </header>
            <div className="projectruns-summary">
              <span data-status={selected.status}>{statusLabel(selected.status)}</span>
              <span>{selected.trigger === "schedule" ? "定时启动" : selected.trigger === "step" ? "单步执行" : "手动启动"}</span>
              <span>{selected.steps.length} 个步骤</span>
            </div>
            <section className="projectruns-steps">
              {selected.steps.map((step, index) => (
                <div className="projectruns-step" data-status={step.status} key={step.stepId}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{step.name}</strong>
                    <small>{step.message ?? stepStatusLabel(step.status)}</small>
                  </div>
                </div>
              ))}
            </section>
            <p className="projectruns-privacy">历史记录只保留状态和耗时；命令输出、终端会话与项目绝对路径不会写入历史文件。</p>
          </>
        ) : (
          <div className="projectruns-detail-empty">选择一条运行记录查看步骤状态。</div>
        )}
        {error && <div className="projectruns-error">{error}</div>}
      </main>
    </div>
  );
}
