import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import {
  getStoredEntryPosition,
  setStoredEntryPosition,
  type EntryWindowPosition,
} from "./windowPosition";

const shellStyle: CSSProperties = {
  width: "100vw",
  height: "100vh",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  color: "rgba(255,255,255,0.92)",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const centerButtonStyle: CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: 74,
  height: 74,
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "linear-gradient(145deg, rgba(24,31,45,0.96), rgba(14,18,28,0.96))",
  boxShadow: "0 14px 38px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.18)",
  cursor: "grab",
  display: "grid",
  placeItems: "center",
  userSelect: "none",
  transition: "transform 180ms ease, box-shadow 180ms ease, filter 180ms ease",
  touchAction: "none",
};

const catStyle: CSSProperties = {
  position: "relative",
  width: 42,
  height: 34,
  borderRadius: 4,
  background: "#f8fafc",
  imageRendering: "pixelated",
  boxShadow:
    "0 -8px 0 #f8fafc, -12px -12px 0 #f8fafc, 12px -12px 0 #f8fafc, -8px 8px 0 #94a3b8, 8px 8px 0 #94a3b8",
};

const eyeStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  width: 6,
  height: 6,
  borderRadius: 1,
  background: "#111827",
};

const noseStyle: CSSProperties = {
  position: "absolute",
  left: 18,
  top: 20,
  width: 6,
  height: 4,
  borderRadius: 1,
  background: "#fb7185",
};

const ringStyle: CSSProperties = {
  position: "absolute",
  width: 212,
  height: 212,
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(12,16,24,0.76) 0 32%, rgba(12,16,24,0.94) 33% 65%, rgba(255,255,255,0.08) 66% 67%, transparent 68%)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 18px 46px rgba(0,0,0,0.38)",
  opacity: 0,
  transform: "scale(0.72)",
  transition: "opacity 180ms ease, transform 220ms cubic-bezier(.2,.85,.2,1)",
  pointerEvents: "none",
};

const actionButtonStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 58,
  height: 58,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(22,27,38,0.96)",
  color: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  padding: 0,
  outline: "none",
  boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)",
  transition:
    "transform 220ms cubic-bezier(.2,.85,.2,1), opacity 180ms ease, background 120ms ease",
};

const menuItems = [
  { label: "搜索", title: "打开搜索", x: 0, y: -82, action: "search" },
  { label: "报告", title: "打开截图报告", x: 78, y: -26, action: "report" },
  { label: "剪贴", title: "打开剪贴板", x: 48, y: 68, action: "clip" },
  { label: "键盘", title: "切换到键盘模式", x: -48, y: 68, action: "keyboard" },
  { label: "隐藏", title: "隐藏宠物", x: -78, y: -26, action: "hide" },
] as const;

type PetAction = (typeof menuItems)[number]["action"];

function PixelCat() {
  return (
    <span aria-hidden="true" style={catStyle}>
      <span style={{ ...eyeStyle, left: 10 }} />
      <span style={{ ...eyeStyle, right: 10 }} />
      <span style={noseStyle} />
    </span>
  );
}

async function readCurrentPosition(): Promise<EntryWindowPosition> {
  const position = await getCurrentWindow().outerPosition();
  return { x: position.x, y: position.y };
}

async function savePetPosition(): Promise<EntryWindowPosition> {
  const position = await readCurrentPosition();
  setStoredEntryPosition("pet", position);
  return position;
}

async function restorePetPosition() {
  const position = getStoredEntryPosition("pet");
  if (!position) return;
  await getCurrentWindow().setPosition(new PhysicalPosition(position.x, position.y));
}

async function hidePet() {
  await savePetPosition();
  await getCurrentWindow().hide();
}

export function PetEntryApp() {
  const [open, setOpen] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const currentWindow = getCurrentWindow();

    restorePetPosition().catch(console.error);
    currentWindow
      .onMoved(({ payload }) => {
        setStoredEntryPosition("pet", { x: payload.x, y: payload.y });
      })
      .then((value) => {
        unlisten = value;
      })
      .catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  async function openSearch() {
    await invoke("show_search_window");
  }

  async function openScreenshotReport() {
    await invoke("show_screenshotai_window");
  }

  async function openClipboard() {
    await invoke("show_clipboard_window");
  }

  async function switchToKeyboard() {
    const position = await savePetPosition();
    await invoke("switch_to_keyboard_mode", { position });
  }

  async function runAction(action: PetAction) {
    setOpen(false);
    if (action === "search") await openSearch();
    if (action === "report") await openScreenshotReport();
    if (action === "clip") await openClipboard();
    if (action === "keyboard") await switchToKeyboard();
    if (action === "hide") await hidePet();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (open || event.button !== 0) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStartRef.current;
    if (!start || open) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < 4) return;

    pointerStartRef.current = null;
    suppressClickRef.current = true;
    getCurrentWindow()
      .startDragging()
      .then(() => savePetPosition())
      .catch(console.error);
  }

  function handlePointerUp() {
    pointerStartRef.current = null;
    savePetPosition().catch(console.error);
  }

  function handleCenterClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
  }

  return (
    <div style={shellStyle}>
      <div
        style={{
          ...ringStyle,
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.72)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {menuItems.map((item) => (
          <button
            key={item.action}
            onClick={() => runAction(item.action).catch(console.error)}
            style={{
              ...actionButtonStyle,
              opacity: open ? 1 : 0,
              transform: open
                ? `translate(calc(-50% + ${item.x}px), calc(-50% + ${item.y}px)) scale(1)`
                : "translate(-50%, -50%) scale(0.55)",
            }}
            title={item.title}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <button
        aria-label="像素猫入口"
        onClick={handleCenterClick}
        onDoubleClick={() => openSearch().catch(console.error)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          ...centerButtonStyle,
          cursor: open ? "pointer" : "grab",
          transform: open ? "scale(0.92) rotate(45deg)" : "scale(1) rotate(0deg)",
          boxShadow: open
            ? "0 8px 24px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.18)"
            : centerButtonStyle.boxShadow,
        }}
        title={open ? "收起菜单" : "展开快捷入口"}
        type="button"
      >
        <PixelCat />
      </button>
    </div>
  );
}
