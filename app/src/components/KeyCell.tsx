import { forwardRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { KeyBinding, KeyId } from "@/types/actions";
import { ACTION_TYPE_META } from "@/types/actions";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { ActionIcon } from "./ActionIcon";

interface KeyCellProps {
  keyId: KeyId;
  binding: KeyBinding | undefined;
  onClick?: (keyId: KeyId) => void;
  onBind?: (keyId: KeyId) => void;
  isDragSource?: boolean;
  isDropTarget?: boolean;
  isDragging?: boolean;
  isHovered?: boolean;
  onHoverChange?: (keyId: KeyId, hovered: boolean) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  wasDrag?: () => boolean;
}

const KEY_WIDTH = 72;
const KEY_HEIGHT = 68;
const KEY_ICON_SIZE_WITH_LABEL = 27;
const KEY_ICON_SIZE_WITHOUT_LABEL = 36;

const KEYCAP_BORDER = "rgba(255,255,255,0.09)";
const KEYCAP_BORDER_HOVER = "rgba(255,255,255,0.13)";

const KEYCAP_SHADOW = [
  "inset 0 1px 0 rgba(255,255,255,0.08)",
  "0 6px 13px rgba(0,0,0,0.22)",
].join(", ");

function keycapBackground(options: { accent?: string; hover: boolean; keyBgOpacity: number }) {
  const surfaceTopOpacity = options.hover ? 0.13 : 0.105;
  const surfaceBottomOpacity = options.hover ? 0.045 : 0.035;
  const accentLayer = options.accent
    ? `radial-gradient(circle at 50% 38%, ${options.accent}${options.hover ? "24" : "14"}, transparent 46%)`
    : "radial-gradient(circle at 50% 38%, rgba(255,255,255,0.025), transparent 46%)";

  return [
    accentLayer,
    "radial-gradient(circle at 70% 82%, rgba(255,255,255,0.035), transparent 36%)",
    `linear-gradient(145deg, rgba(255,255,255,${surfaceTopOpacity}), rgba(255,255,255,${surfaceBottomOpacity}))`,
  ].join(", ");
}

function Tooltip({ text, visible }: { text: string; visible: boolean }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!visible) return;
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [visible]);

  if (!visible) return null;

  return createPortal(
    <div
      className="theme-popover-surface"
      style={{
        position: "fixed",
        left: pos.x + 14,
        top: pos.y + 14,
        zIndex: 99999,
        pointerEvents: "none",
        background: "var(--theme-bg, rgba(18,18,28,0.93))",
        border: "1px solid var(--theme-border, rgba(255,255,255,0.12))",
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 11,
        color: "rgba(255,255,255,0.82)",
        whiteSpace: "pre-line",
        lineHeight: 1.7,
        maxWidth: 200,
      }}
    >
      {text}
    </div>,
    document.body,
  );
}

export const KeyCell = forwardRef<HTMLDivElement, KeyCellProps>(function KeyCell({
  keyId,
  binding,
  onClick,
  onBind,
  isDragSource,
  isDropTarget,
  isDragging,
  isHovered = false,
  onHoverChange,
  onMouseDown,
  wasDrag,
}, ref) {
  const [pressed, setPressed] = useState(false);
  const action = binding?.action ?? null;
  const meta = action ? ACTION_TYPE_META[action.type] : null;
  const keyBgOpacity = useKeyboardStore((s) => s.theme.keyBgOpacity);
  const showKeyLabels = useKeyboardStore((s) => s.theme.showKeyLabels);
  const showActionName = Boolean(action) && showKeyLabels;
  const actionIconSize = showActionName ? KEY_ICON_SIZE_WITH_LABEL : KEY_ICON_SIZE_WITHOUT_LABEL;

  const handleClick = () => {
    if (wasDrag?.()) return;
    if (action) {
      setPressed(true);
      setTimeout(() => setPressed(false), 120);
      onClick?.(keyId);
      return;
    }
    onBind?.(keyId);
  };

  const accent = meta?.color;
  const hoverActive = isHovered && !isDropTarget && !isDragging;
  const borderColor = action
    ? KEYCAP_BORDER
    : hoverActive
      ? "rgba(255,255,255,0.14)"
      : "rgba(255,255,255,0.035)";

  const baseStyle: CSSProperties = {
    width: KEY_WIDTH,
    height: KEY_HEIGHT,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor,
    background: keycapBackground({ accent, hover: hoverActive, keyBgOpacity }),
    boxShadow: action ? KEYCAP_SHADOW : "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "grab",
    position: "relative",
    overflow: "hidden",
    padding: 0,
    outline: "none",
    userSelect: "none",
    color: "rgba(252,253,255,0.98)",
    transition:
      "background 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 220ms ease, transform 160ms ease",
    transform: pressed
      ? "translateY(1px) scale(0.985)"
      : hoverActive
        ? "translateY(-3px) scale(1.022)"
        : "translateY(0) scale(1)",
    gap: 0,
  };

  const stateStyle: CSSProperties = {
    ...(action
      ? {
          borderColor: hoverActive ? KEYCAP_BORDER_HOVER : KEYCAP_BORDER,
          boxShadow: [
            "inset 0 1px 0 rgba(255,255,255,0.085)",
            "0 7px 14px rgba(0,0,0,0.24)",
            `0 0 ${hoverActive ? 11 : 5}px ${accent}1f`,
          ].join(", "),
        }
      : {}),
    ...(!action && hoverActive
      ? {
          background: `rgba(255,255,255,${Math.max(keyBgOpacity, 0.06)})`,
        }
      : {}),
    ...(isDropTarget
      ? {
          borderColor: "rgba(96,165,250,0.72)",
          background: "rgba(59,130,246,0.15)",
          boxShadow:
            "0 0 11px rgba(59,130,246,0.34), inset 0 0 8px rgba(59,130,246,0.13), 0 7px 14px rgba(0,0,0,0.24)",
        }
      : {}),
    ...(isDragSource ? { opacity: 0.35 } : {}),
  };

  return (
    <>
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onMouseDown={onMouseDown}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onBind?.(keyId);
        }}
        onMouseEnter={() => onHoverChange?.(keyId, true)}
        onMouseLeave={() => onHoverChange?.(keyId, false)}
        onBlur={() => onHoverChange?.(keyId, false)}
        style={{ ...baseStyle, ...stateStyle }}
      >
        <span
          style={{
            position: "absolute",
            top: 5,
            left: 8,
            fontSize: 9,
            fontWeight: 620,
            color: "rgba(220,226,239,0.48)",
            lineHeight: 1,
            letterSpacing: 0,
            pointerEvents: "none",
          }}
        >
          {keyId}
        </span>

        {action && (
          <div
            style={{
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: accent,
            }}
          >
            <ActionIcon action={action} size={actionIconSize} />
          </div>
        )}
        {action && showActionName && (
          <span
            style={{
              maxWidth: "62px",
              marginTop: 3,
              padding: "0 3px",
              fontSize: 9,
              fontWeight: 650,
              lineHeight: 1.15,
              letterSpacing: 0,
              color: "rgba(252,253,255,0.9)",
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {action.name}
          </span>
        )}
      </div>
      <Tooltip
        text={action ? `${action.name}\n[\u5feb\u6377\u952e ${keyId}] \u5de6\u952e\u6267\u884c / \u53f3\u952e\u7f16\u8f91` : `\u70b9\u51fb\u7ed1\u5b9a [${keyId}]`}
        visible={isHovered && !isDragging}
      />
    </>
  );
});
