import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/icons";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => (
    new Promise<boolean>((resolve) => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setRequest(options);
    })
  ), []);

  useEffect(() => () => resolverRef.current?.(false), []);

  const dialog = request ? (
    <ConfirmDialog
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel}
      tone={request.tone}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { confirm, dialog };
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "确认",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [busy, onCancel]);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const accent = tone === "danger" ? "#f87171" : "#60a5fa";
  const accentBackground = tone === "danger" ? "rgba(220,38,38,0.78)" : "rgba(37,99,235,0.82)";

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(3,7,18,0.58)",
        backdropFilter: "blur(5px)",
        WebkitBackdropFilter: "blur(5px)",
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        style={{
          width: 360,
          maxWidth: "calc(100vw - 32px)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--theme-bg-solid, #101622)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.46)",
        }}
      >
        <header
          style={{
            minHeight: 46,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px 0 15px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span id="confirm-dialog-title" style={{ fontSize: 13, fontWeight: 750, color: "rgba(255,255,255,0.9)" }}>
            {title}
          </span>
          <button
            type="button"
            aria-label="关闭确认框"
            onClick={onCancel}
            disabled={busy}
            style={{
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              border: 0,
              borderRadius: 7,
              background: "transparent",
              color: "rgba(255,255,255,0.45)",
              cursor: "pointer",
            }}
          >
            <CloseIcon size={14} decorative />
          </button>
        </header>
        <div style={{ padding: "17px 16px 16px" }}>
          <p
            id="confirm-dialog-message"
            style={{
              margin: 0,
              color: "rgba(255,255,255,0.64)",
              fontSize: 12,
              lineHeight: 1.7,
              whiteSpace: "pre-line",
            }}
          >
            {message}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={busy}
              style={{
                minWidth: 70,
                padding: "7px 14px",
                borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.13)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.7)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 650,
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              style={{
                minWidth: 86,
                padding: "7px 14px",
                borderRadius: 7,
                border: `1px solid ${accent}66`,
                background: accentBackground,
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {busy ? "处理中…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
