import { useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

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
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.18)",
  background: "linear-gradient(145deg, rgba(20,184,166,0.92), rgba(37,99,235,0.9))",
  boxShadow: "0 14px 38px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.26)",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  userSelect: "none",
  transition: "transform 180ms ease, box-shadow 180ms ease, filter 180ms ease",
};

const faceStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "center",
};

const eyeStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.92)",
  boxShadow: "0 0 10px rgba(255,255,255,0.35)",
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1,
  letterSpacing: 0,
};

const ringStyle: CSSProperties = {
  position: "absolute",
  width: 190,
  height: 190,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(12,16,24,0.76) 0 34%, rgba(12,16,24,0.94) 35% 64%, rgba(255,255,255,0.08) 65% 66%, transparent 67%)",
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
  fontSize: 11,
  fontWeight: 800,
  padding: 0,
  outline: "none",
  boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)",
  transition: "transform 220ms cubic-bezier(.2,.85,.2,1), opacity 180ms ease, background 120ms ease",
};

const menuItems = [
  { label: "搜索", title: "打开搜索", x: 0, y: -72, action: "search" },
  { label: "报告", title: "打开截图报告", x: 72, y: 0, action: "report" },
  { label: "剪贴", title: "打开剪贴板", x: 0, y: 72, action: "clip" },
  { label: "隐藏", title: "隐藏宠物", x: -72, y: 0, action: "hide" },
] as const;

async function hidePet() {
  await getCurrentWindow().hide();
}

export function PetEntryApp() {
  const [open, setOpen] = useState(false);

  async function openSearch() {
    await invoke("show_search_window");
  }

  async function openScreenshotReport() {
    await invoke("toggle_screenshotai_window");
  }

  async function openClipboard() {
    await invoke("toggle_clipboard_window");
  }

  async function runAction(action: (typeof menuItems)[number]["action"]) {
    try {
      if (action === "search") await openSearch();
      if (action === "report") await openScreenshotReport();
      if (action === "clip") await openClipboard();
      if (action === "hide") await hidePet();
    } finally {
      setOpen(false);
    }
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
        aria-label="DevLauncher pet entry"
        onClick={() => setOpen((value) => !value)}
        onDoubleClick={() => openSearch().catch(console.error)}
        style={{
          ...centerButtonStyle,
          transform: open ? "scale(0.92) rotate(45deg)" : "scale(1) rotate(0deg)",
          boxShadow: open
            ? "0 8px 24px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.24)"
            : centerButtonStyle.boxShadow,
        }}
        title={open ? "收起菜单" : "展开快捷入口"}
        type="button"
      >
        <div style={faceStyle}>
          <span style={eyeStyle} />
          <span style={eyeStyle} />
        </div>
        <span style={labelStyle}>DL</span>
      </button>
    </div>
  );
}
