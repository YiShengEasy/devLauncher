import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { LauncherActionRecord } from "@/launcher/actionIndex";
import { searchActionRecords } from "@/launcher/actionIndex";

const shellStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  padding: 12,
  background: "rgba(12,14,24,0.92)",
  color: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  overflow: "hidden",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  height: 44,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.92)",
  outline: "none",
  padding: "0 12px",
  fontSize: 16,
};

interface SearchPanelProps {
  records: LauncherActionRecord[];
  initialQuery?: string;
  onExecute: (record: LauncherActionRecord) => void;
  onClose: () => void;
}

export function SearchPanel({
  records,
  initialQuery = "",
  onExecute,
  onClose,
}: SearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const results = useMemo(() => searchActionRecords(records, query), [records, query]);
  const selected = results[selectedIndex]?.record;

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (event.key === "Enter" && selected) {
      event.preventDefault();
      onExecute(selected);
    }
  }

  return (
    <div style={shellStyle}>
      <input
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        aria-label="Search actions, tools, OCR text"
        placeholder="Search actions, tools, OCR text"
        style={inputStyle}
      />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {results.map(({ record }, index) => (
          <button
            key={record.id}
            onClick={() => onExecute(record)}
            style={{
              minHeight: 48,
              textAlign: "left",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              background: index === selectedIndex ? "rgba(59,130,246,0.28)" : "rgba(255,255,255,0.045)",
              color: "rgba(255,255,255,0.9)",
              cursor: "pointer",
              padding: "7px 10px",
            }}
            type="button"
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>{record.title}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
              {record.subtitle ?? record.source}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
