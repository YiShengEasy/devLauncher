import { forwardRef, useState } from "react";
import type { KeyId, KeyBinding } from "@/types/actions";
import { ACTION_TYPE_META } from "@/types/actions";
import { ActionIcon } from "./ActionIcon";
import { useKeyboardStore } from "@/store/useKeyboardStore";

interface KeyCellProps {
  keyId: KeyId;
  binding: KeyBinding | undefined;
  onClick?: (keyId: KeyId) => void;
  onBind?: (keyId: KeyId) => void;
  isDragSource?: boolean;
  isDropTarget?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  wasDrag?: () => boolean;
}

const KEY_SIZE = 68;

export const KeyCell = forwardRef<HTMLDivElement, KeyCellProps>(function KeyCell({
  keyId, binding, onClick, onBind,
  isDragSource, isDropTarget,
  onMouseDown, wasDrag,
}, ref) {
  const [pressed, setPressed] = useState(false);
  const action = binding?.action ?? null;
  const meta = action ? ACTION_TYPE_META[action.type] : null;
  const keyBgOpacity = useKeyboardStore((s) => s.theme.keyBgOpacity);

  const handleClick = () => {
    // Ignore click if it was a drag operation
    if (wasDrag?.()) return;
    if (action) {
      setPressed(true);
      setTimeout(() => setPressed(false), 120);
      onClick?.(keyId);
    } else {
      onBind?.(keyId);
    }
  };

  // ── Drop target highlight ──
  const dropStyle: React.CSSProperties = isDropTarget
    ? { borderColor: "rgba(59,130,246,0.8)", boxShadow: "0 0 12px rgba(59,130,246,0.5), inset 0 0 8px rgba(59,130,246,0.15)" }
    : {};

  // ── Drag source fade ──
  const dragStyle: React.CSSProperties = isDragSource
    ? { opacity: 0.35 }
    : {};

  const baseStyle: React.CSSProperties = {
    width: KEY_SIZE, height: KEY_SIZE,
    borderRadius: 10,
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    cursor: "grab",
    position: "relative", overflow: "hidden",
    padding: 0, outline: "none",
    userSelect: "none",
    transition: "all 0.1s ease",
  };

  // ── Bound key ──
  if (action) {
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onMouseDown={onMouseDown}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
        onContextMenu={(e) => { e.preventDefault(); onBind?.(keyId); }}
        title={`${action.name}\n[${keyId}] 左键执行 / 右键编辑\n拖拽可更换键位`}
        style={{
          ...baseStyle,
          border: `1px solid ${meta!.color}44`,
          background: pressed ? meta!.bg.replace("0.75", "0.95") : meta!.bg,
          gap: 3,
          transform: pressed ? "scale(0.91)" : "scale(1)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)",
          ...dropStyle,
          ...dragStyle,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.filter = "brightness(1.2)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.filter = "brightness(1)"; }}
      >
        <span style={{
          position: "absolute", top: 3, left: 5,
          fontSize: 8, fontWeight: 600,
          color: "rgba(255,255,255,0.38)", lineHeight: 1, letterSpacing: "0.5px",
          pointerEvents: "none",
        }}>
          {keyId}
        </span>
        <span style={{
          position: "absolute", top: 3, right: 4,
          fontSize: 7, fontWeight: 700, lineHeight: 1,
          color: meta!.color, opacity: 0.8, letterSpacing: "0.3px",
          textTransform: "uppercase",
          pointerEvents: "none",
        }}>
          {action.type}
        </span>
        <div style={{ pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ActionIcon action={action} size={32} />
        </div>
        <span style={{
          fontSize: 10, fontWeight: 500,
          color: "rgba(255,255,255,0.88)",
          maxWidth: KEY_SIZE - 6, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight: 1, textAlign: "center",
          pointerEvents: "none",
        }}>
          {action.name}
        </span>
      </div>
    );
  }

  // ── Unbound key ──
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onMouseDown={onMouseDown}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
      title={`绑定 [${keyId}]\n拖拽可更换键位`}
      style={{
        ...baseStyle,
        border: isDropTarget
          ? "1px solid rgba(59,130,246,0.8)"
          : "1px dashed rgba(255,255,255,0.14)",
        background: isDropTarget
          ? "rgba(59,130,246,0.15)"
          : `rgba(255,255,255,${keyBgOpacity})`,
        gap: 2,
        boxShadow: isDropTarget
          ? "0 0 12px rgba(59,130,246,0.5), inset 0 0 8px rgba(59,130,246,0.15)"
          : "none",
        ...dragStyle,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        if (!isDropTarget) {
          el.style.background = "rgba(255,255,255,0.09)";
          el.style.borderColor = "rgba(255,255,255,0.28)";
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        if (!isDropTarget) {
          el.style.background = `rgba(255,255,255,${keyBgOpacity})`;
          el.style.borderColor = "rgba(255,255,255,0.14)";
        }
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.25)", letterSpacing: "0.5px", pointerEvents: "none" }}>
        {keyId}
      </span>
      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.15)", lineHeight: 1, pointerEvents: "none" }}>+</span>
    </div>
  );
});
