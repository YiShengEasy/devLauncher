import { useState, useCallback, useRef } from "react";
import { KEY_ROWS } from "@/types/actions";
import type { KeyId, KeyMap } from "@/types/actions";
import { ACTION_TYPE_META } from "@/types/actions";
import { KeyCell } from "./KeyCell";
import { ActionIcon } from "./ActionIcon";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { saveConfig } from "@/api/config";
import { isMacPlatform } from "@/platform/shortcuts";

interface KeyboardPanelProps {
  keys: KeyMap;
  onKeyClick?: (keyId: KeyId) => void;
  onKeyBind?: (keyId: KeyId) => void;
}

const ROW_PADDING = [0, 18, 45, 90];

const KEY_WIDTH = 72;
const KEY_HEIGHT = 68;
const KEY_GAP = 8;
const KEY_ICON_SIZE = 32;

export function KeyboardPanel({ keys, onKeyClick, onKeyBind }: KeyboardPanelProps) {
  const [dragKey, setDragKey] = useState<KeyId | null>(null);
  const [dropTarget, setDropTarget] = useState<KeyId | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverResetSignal, setHoverResetSignal] = useState(0);
  const isDragging = useRef(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<KeyId, HTMLDivElement>>(new Map());

  const { swapKeys, activePageIndex } = useKeyboardStore();

  const handleSwap = useCallback((from: KeyId, to: KeyId) => {
    swapKeys(activePageIndex, from, to);
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  }, [swapKeys, activePageIndex]);

  // Register cell ref
  const registerCell = useCallback((keyId: KeyId, el: HTMLDivElement | null) => {
    if (el) {
      cellRefs.current.set(keyId, el);
    } else {
      cellRefs.current.delete(keyId);
    }
  }, []);

  // Find which key the cursor is over
  const getKeyAtPoint = useCallback((x: number, y: number): KeyId | null => {
    for (const [keyId, el] of cellRefs.current) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return keyId;
      }
    }
    return null;
  }, []);

  const handleMouseDown = useCallback((keyId: KeyId, e: React.MouseEvent) => {
    // Only left button
    if (e.button !== 0) return;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartPos.current!.x;
      const dy = ev.clientY - dragStartPos.current!.y;
      // Start drag after moving 4px (distinguish from click)
      if (!isDragging.current && Math.sqrt(dx * dx + dy * dy) > 4) {
        isDragging.current = true;
        setDragKey(keyId);
      }
      if (isDragging.current) {
        setDragPos({ x: ev.clientX, y: ev.clientY });
        const hoveredKey = getKeyAtPoint(ev.clientX, ev.clientY);
        setDropTarget(hoveredKey && hoveredKey !== keyId ? hoveredKey : null);
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (isDragging.current) {
        const hoveredKey = getKeyAtPoint(ev.clientX, ev.clientY);
        if (hoveredKey && hoveredKey !== keyId) {
          handleSwap(keyId, hoveredKey);
        }
      }
      isDragging.current = false;
      setDragKey(null);
      setDropTarget(null);
      setDragPos(null);
      setHoverResetSignal((value) => value + 1);
      dragStartPos.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [getKeyAtPoint, handleSwap]);

  // Check if a click should be ignored (was a drag)
  const wasDrag = useCallback(() => isDragging.current, []);

  // Drag ghost: floating clone of the dragged key.
  const renderDragGhost = () => {
    if (!dragKey || !dragPos) return null;
    const binding = keys[dragKey];
    const action = binding?.action ?? null;
    return (
      <div style={{
        position: "fixed",
        left: dragPos.x - KEY_WIDTH / 2,
        top: dragPos.y - KEY_HEIGHT / 2,
        width: KEY_WIDTH, height: KEY_HEIGHT,
        borderRadius: 8,
        border: "1px solid rgba(96,165,250,0.72)",
        background: action
          ? [
              `radial-gradient(circle at 50% 38%, ${ACTION_TYPE_META[action.type]?.color ?? "#60a5fa"}24, transparent 46%)`,
              "radial-gradient(circle at 70% 82%, rgba(255,255,255,0.035), transparent 36%)",
              "linear-gradient(145deg, rgba(255,255,255,0.13), rgba(255,255,255,0.045))",
            ].join(", ")
          : "linear-gradient(145deg, rgba(255,255,255,0.13), rgba(255,255,255,0.045))",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
        zIndex: 9999,
        opacity: 0.85,
        transform: "scale(1.08)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.085), 0 8px 24px rgba(0,0,0,0.5), 0 0 11px rgba(59,130,246,0.22)",
        transition: "none",
      }}>
        <span style={{
          position: "absolute", top: 3, left: 5,
          fontSize: 8, fontWeight: 600,
          color: "rgba(255,255,255,0.5)", lineHeight: 1,
        }}>
          {dragKey}
        </span>
        {action && <ActionIcon action={action} size={KEY_ICON_SIZE} />}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: KEY_GAP,
        userSelect: "none",
      }}
    >
      {KEY_ROWS.map((row, rowIndex) => (
        <div
          key={rowIndex}
          style={{ display: "flex", gap: KEY_GAP, paddingLeft: ROW_PADDING[rowIndex] }}
        >
          {row.map((keyId) => (
            <KeyCell
              key={keyId}
              keyId={keyId}
              binding={keys[keyId]}
              onClick={onKeyClick}
              onBind={onKeyBind}
              isDragSource={dragKey === keyId}
              isDropTarget={dropTarget === keyId}
              isDragging={dragKey !== null}
              hoverResetSignal={hoverResetSignal}
              onMouseDown={(e) => handleMouseDown(keyId, e)}
              wasDrag={wasDrag}
              ref={(el) => registerCell(keyId, el)}
            />
          ))}
        </div>
      ))}
      {!isMacPlatform() && (
        <div style={{
          marginTop: 4,
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
          letterSpacing: "0.02em",
        }}>
          双击 Ctrl 唤起键盘 · Alt + 字母/数字执行绑定
        </div>
      )}
      {renderDragGhost()}
    </div>
  );
}
