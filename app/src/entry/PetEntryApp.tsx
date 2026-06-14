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

const bubbleStyle: CSSProperties = {
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

const panelStyle: CSSProperties = {
  position: "absolute",
  inset: 4,
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(12,16,24,0.94)",
  boxShadow: "0 12px 34px rgba(0,0,0,0.42)",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 5,
  padding: 7,
  boxSizing: "border-box",
};

const actionButtonStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.13)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 800,
  padding: 0,
  outline: "none",
};

async function hidePet() {
  await getCurrentWindow().hide();
}

export function PetEntryApp() {
  const [open, setOpen] = useState(false);

  async function openSearch() {
    await invoke("show_search_window");
  }

  async function openOcr() {
    await invoke("toggle_ocr_window");
  }

  async function openClipboard() {
    await invoke("toggle_clipboard_window");
  }

  return (
    <div style={shellStyle}>
      <button
        aria-label="DevLauncher pet entry"
        onClick={() => setOpen((value) => !value)}
        onDoubleClick={() => openSearch().catch(console.error)}
        style={bubbleStyle}
        title="Click for quick actions. Double click opens search."
        type="button"
      >
        <div style={faceStyle}>
          <span style={eyeStyle} />
          <span style={eyeStyle} />
        </div>
        <span style={labelStyle}>DL</span>
      </button>

      {open && (
        <div style={panelStyle}>
          <button
            onClick={() => openSearch().catch(console.error)}
            style={actionButtonStyle}
            title="Open search"
            type="button"
          >
            Search
          </button>
          <button
            onClick={() => openOcr().catch(console.error)}
            style={actionButtonStyle}
            title="Start OCR"
            type="button"
          >
            OCR
          </button>
          <button
            onClick={() => openClipboard().catch(console.error)}
            style={actionButtonStyle}
            title="Open clipboard"
            type="button"
          >
            Clip
          </button>
          <button
            onClick={() => hidePet().catch(console.error)}
            style={actionButtonStyle}
            title="Hide pet"
            type="button"
          >
            Hide
          </button>
        </div>
      )}
    </div>
  );
}
