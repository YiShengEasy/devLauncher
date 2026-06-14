import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { buildOcrActionRecords, type LauncherActionRecord } from "@/launcher/actionIndex";
import { executeLauncherAction } from "@/launcher/actionExecutor";
import { SEARCH_PREFILL_EVENT } from "./entryEvents";

const shellStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  padding: 14,
  background: "rgba(13,17,23,0.94)",
  color: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.2,
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const buttonStyle: CSSProperties = {
  minHeight: 34,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  padding: "0 11px",
  fontSize: 12,
  fontWeight: 700,
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "rgba(37,99,235,0.72)",
  borderColor: "rgba(147,197,253,0.4)",
};

const textAreaStyle: CSSProperties = {
  width: "100%",
  minHeight: 148,
  flex: "1 1 auto",
  resize: "none",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.9)",
  outline: "none",
  padding: 10,
  fontSize: 13,
  lineHeight: 1.45,
};

const statusStyle: CSSProperties = {
  minHeight: 18,
  color: "rgba(255,255,255,0.58)",
  fontSize: 12,
};

function normalizeOcrText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function OcrEntryApp() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Ready");
  const [isRecognizing, setIsRecognizing] = useState(false);
  const actions = useMemo(() => buildOcrActionRecords(text), [text]);

  async function runOcr() {
    setIsRecognizing(true);
    setStatus("Recognizing selected area");

    try {
      const result = await invoke<string>("ocr_recognize_selection");
      const normalized = normalizeOcrText(result);
      setText(normalized);
      setStatus(normalized ? "OCR complete" : "No text recognized");
    } catch (error) {
      setStatus(String(error));
    } finally {
      setIsRecognizing(false);
    }
  }

  async function execute(record: LauncherActionRecord) {
    await executeLauncherAction(record, {
      invoke,
      openSearchWithText: async (value) => {
        await invoke("show_search_window");
        window.dispatchEvent(new CustomEvent(SEARCH_PREFILL_EVENT, { detail: { text: value } }));
      },
    });
    setStatus(`${record.title} complete`);
  }

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>OCR</h1>
          <div style={statusStyle}>{status}</div>
        </div>
        <button
          onClick={() => getCurrentWindow().hide().catch(() => {})}
          style={buttonStyle}
          type="button"
        >
          Close
        </button>
      </div>

      <div style={buttonRowStyle}>
        <button
          disabled={isRecognizing}
          onClick={() => runOcr().catch(console.error)}
          style={{ ...primaryButtonStyle, opacity: isRecognizing ? 0.65 : 1 }}
          type="button"
        >
          {isRecognizing ? "Recognizing" : "Select area and recognize"}
        </button>
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => execute(action).catch((error) => setStatus(String(error)))}
            style={buttonStyle}
            type="button"
          >
            {action.title}
          </button>
        ))}
      </div>

      <textarea
        aria-label="OCR text"
        onChange={(event) => setText(event.target.value)}
        placeholder="Recognized text will appear here"
        spellCheck={false}
        style={textAreaStyle}
        value={text}
      />
    </div>
  );
}
