import { useState, useCallback, useRef } from "react";
import { KEY_ROWS } from "@/types/actions";
import type { KeyId, KeyMap } from "@/types/actions";
import { KeyCell } from "./KeyCell";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { saveConfig } from "@/api/config";

interface KeyboardPanelProps {
  keys: KeyMap;
  onKeyClick?: (keyId: KeyId) => void;
  onKeyBind?: (keyId: KeyId) => void;
}

// Row left-padding to mimic keyboard stagger (px)
const ROW_PADDING = [0, 0, 18, 28];

const KEY_SIZE = 68;
const KEY_GAP = 7;

export function KeyboardPanel({ keys, onKeyClick, onKeyBind }: KeyboardPanelProps) {
  const [dragKey, setDragKey] = useState<KeyId | null>(null);
  const [dropTarget, setDropTarget] = useState<KeyId | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
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
      dragStartPos.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [getKeyAtPoint, handleSwap]);

  // Check if a click should be ignored (was a drag)
  const wasDrag = useCallback(() => isDragging.current, []);

  // ── Drag ghost (floating clone of the dragged key) ──
  const renderDragGhost = () => {
    if (!dragKey || !dragPos) return null;
    const binding = keys[dragKey];
    const action = binding?.action ?? null;
    return (
      <div style={{
        position: "fixed",
        left: dragPos.x - KEY_SIZE / 2,
        top: dragPos.y - KEY_SIZE / 2,
        width: KEY_SIZE, height: KEY_SIZE,
        borderRadius: 10,
        border: "2px solid rgba(59,130,246,0.9)",
        background: action
          ? (ACTION_TYPE_META[action.type]?.bg ?? "rgba(59,130,246,0.6)")
          : "rgba(255,255,255,0.15)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
        zIndex: 9999,
        opacity: 0.85,
        transform: "scale(1.08)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        transition: "none",
      }}>
        <span style={{
          position: "absolute", top: 3, left: 5,
          fontSize: 8, fontWeight: 600,
          color: "rgba(255,255,255,0.5)", lineHeight: 1,
        }}>
          {dragKey}
        </span>
        {action && (
          <span style={{ fontSize: 9, fontWeight: 500, color: "rgba(255,255,255,0.9)", lineHeight: 1 }}>
            {action.name}
          </span>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: KEY_GAP, userSelect: "none" }}>
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
              onMouseDown={(e) => handleMouseDown(keyId, e)}
              wasDrag={wasDrag}
              ref={(el) => registerCell(keyId, el)}
            />
          ))}
        </div>
      ))}
      {renderDragGhost()}
    </div>
  );
}

// Need to import ACTION_TYPE_META for ghost rendering
import { ACTION_TYPE_META } from "@/types/actions";
