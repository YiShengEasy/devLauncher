import { useEffect, useState } from "react";
import { MacWindowControls } from "@/components/MacWindowControls";
import type { WorkflowDefinition } from "@/types/actions";
import type { WorkflowImportTarget } from "./workflowImport";

interface WorkflowImportDialogProps {
  taskName: string;
  workflows: WorkflowDefinition[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (target: WorkflowImportTarget) => void;
}

export function WorkflowImportDialog({
  taskName,
  workflows,
  busy,
  error,
  onClose,
  onConfirm,
}: WorkflowImportDialogProps) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState(`Runme · ${taskName}`);
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? "");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  const confirmDisabled =
    busy
    || (mode === "new" ? !name.trim() : !workflowId);

  return (
    <div
      className="theme-modal-backdrop projecttasks-workflow-import-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="theme-dialog-surface projecttasks-workflow-import"
        role="dialog"
        aria-modal="true"
        aria-labelledby="projecttasks-workflow-import-title"
      >
        <header className="projecttasks-workflow-import-header">
          <div>
            <strong id="projecttasks-workflow-import-title">保存任务到工作流</strong>
            <span>{taskName}</span>
          </div>
          <MacWindowControls
            onClose={onClose}
            closeTitle="关闭工作流导入"
            showPin={false}
          />
        </header>

        <div className="projecttasks-workflow-import-body">
          <div className="projecttasks-workflow-import-modes" role="tablist" aria-label="导入方式">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "new"}
              data-active={mode === "new"}
              onClick={() => setMode("new")}
            >
              新建工作流
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "existing"}
              data-active={mode === "existing"}
              disabled={workflows.length === 0}
              onClick={() => setMode("existing")}
            >
              加入已有工作流
            </button>
          </div>

          {mode === "new" ? (
            <label className="projecttasks-workflow-import-field">
              <span>工作流名称</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !confirmDisabled) {
                    onConfirm({ type: "new", name });
                  }
                }}
              />
            </label>
          ) : (
            <div className="projecttasks-workflow-import-list" role="listbox" aria-label="已有工作流">
              {workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  role="option"
                  aria-selected={workflow.id === workflowId}
                  data-active={workflow.id === workflowId}
                  onClick={() => setWorkflowId(workflow.id)}
                >
                  <span>{workflow.name}</span>
                  <small>{workflow.steps.length} 个步骤</small>
                </button>
              ))}
            </div>
          )}

          {error && <div className="projecttasks-workflow-import-error">{error}</div>}
        </div>

        <footer className="projecttasks-workflow-import-footer">
          <button type="button" onClick={onClose} disabled={busy}>取消</button>
          <button
            type="button"
            data-primary="true"
            disabled={confirmDisabled}
            onClick={() => onConfirm(
              mode === "new"
                ? { type: "new", name }
                : { type: "existing", workflowId },
            )}
          >
            {busy ? "正在保存…" : mode === "new" ? "创建并导入" : "添加为步骤"}
          </button>
        </footer>
      </div>
    </div>
  );
}
