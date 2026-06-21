import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import gsap from "gsap";
import type { LauncherActionRecord } from "@/launcher/actionIndex";
import { searchActionRecords } from "@/launcher/actionIndex";
import { ActionIcon } from "@/components/ActionIcon";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { MacWindowControls } from "@/components/MacWindowControls";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";

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
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  gap: 10,
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

const iconButtonStyle: CSSProperties = {
  width: 58,
  minWidth: 58,
  height: 58,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.055)",
  color: "rgba(255,255,255,0.86)",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: 4,
};

interface SearchPanelProps {
  records: LauncherActionRecord[];
  quickActions: LauncherActionRecord[];
  initialQuery?: string;
  onExecute: (record: LauncherActionRecord) => void;
  onClose: () => void;
}

export function SearchPanel({
  records,
  quickActions,
  initialQuery = "",
  onExecute,
  onClose,
}: SearchPanelProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isEmptyQuery = query.trim().length === 0;
  const results = useMemo(
    () => isEmptyQuery ? [] : searchActionRecords(records, query),
    [records, query, isEmptyQuery],
  );
  const selected = results[selectedIndex]?.record;

  useGsapContext(shellRef, () => {
    if (!shellRef.current) return;
    animatePanelEnter(shellRef.current, reducedMotion);
  }, []);

  useGsapContext(quickActionsRef, () => {
    if (!isEmptyQuery || !quickActionsRef.current) return;
    const children = Array.from(quickActionsRef.current.children);
    if (children.length === 0) return;
    animateListEnter(children, reducedMotion);
  }, [isEmptyQuery, quickActions.length, reducedMotion]);

  useGsapContext(resultsRef, () => {
    if (isEmptyQuery || !resultsRef.current || results.length === 0) return;
    const children = Array.from(resultsRef.current.children);
    if (children.length === 0) return;
    gsap.killTweensOf(children);
    gsap.fromTo(
      children,
      { autoAlpha: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 6, scale: reducedMotion ? 1 : 0.995 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: reducedMotion ? 0 : 0.18,
        ease: "power2.out",
        stagger: reducedMotion ? 0 : 0.025,
        overwrite: "auto",
      },
    );
  }, [query, results.length, isEmptyQuery, reducedMotion]);

  useEffect(() => {
    if (isEmptyQuery || !resultsRef.current || !selected) return;
    const selectedButton = resultsRef.current.querySelector<HTMLElement>(`[data-result-id="${CSS.escape(selected.id)}"]`);
    if (!selectedButton) return;
    gsap.fromTo(
      selectedButton,
      { x: reducedMotion ? 0 : -3 },
      { x: 0, duration: reducedMotion ? 0 : 0.16, ease: "power2.out", overwrite: "auto" },
    );
  }, [selectedIndex, selected, isEmptyQuery, reducedMotion]);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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

  function renderResultIcon(record: LauncherActionRecord) {
    if (record.source !== "plugin") return null;
    return (
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          background: "rgba(16,185,129,0.16)",
          color: "#a7f3d0",
          fontSize: 14,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        P
      </div>
    );
  }

  function renderQuickIcon(record: LauncherActionRecord) {
    if (record.action) {
      return <ActionIcon action={record.action} size={30} />;
    }
    if (record.builtinFeature) {
      return <BuiltinIcon feature={record.builtinFeature} size={28} />;
    }
    return <span style={{ fontSize: 18, fontWeight: 800 }}>{record.title.charAt(0).toUpperCase()}</span>;
  }

  return (
    <div ref={shellRef} style={shellStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          aria-label="Search actions and tools"
          placeholder="Search actions and tools"
          style={inputStyle}
        />
        <MacWindowControls onClose={onClose} closeTitle="关闭搜索" style={{ padding: "0 4px" }} />
      </div>
      <div ref={resultsRef} className="motion-list motion-scroll-area" style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {!isEmptyQuery && results.map(({ record }, index) => (
            <button
              key={record.id}
              data-result-id={record.id}
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
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                {renderResultIcon(record)}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{record.title}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                    {record.subtitle ?? record.source}
                  </div>
                </div>
              </div>
            </button>
          ))}
      </div>
      <div
        ref={quickActionsRef}
        className="motion-list"
        style={{
          display: isEmptyQuery ? "flex" : "none",
          gap: 8,
          overflowX: "auto",
          overflowY: "hidden",
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {quickActions.map((record) => (
          <button
            key={record.id}
            className="quick-action-icon"
            onClick={() => onExecute(record)}
            style={iconButtonStyle}
            title={record.subtitle ? `${record.title} - ${record.subtitle}` : record.title}
            type="button"
          >
            {renderQuickIcon(record)}
            <span style={{ maxWidth: 48, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, fontWeight: 700 }}>
              {record.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
