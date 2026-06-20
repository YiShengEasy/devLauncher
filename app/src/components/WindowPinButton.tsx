import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PinIcon } from "@/icons";
import {
  getWindowPinState,
  setWindowPinState,
  WINDOW_PIN_CHANGED_EVENT,
  type WindowPinState,
} from "@/windowPinning";

interface WindowPinButtonProps {
  style?: CSSProperties;
}

const buttonStyle: CSSProperties = {
  width: 23,
  height: 23,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.18)",
  background: [
    "linear-gradient(180deg, rgba(255,255,255,0.24), rgba(255,255,255,0.06) 45%, rgba(15,23,42,0.22))",
    "radial-gradient(circle at 35% 18%, rgba(255,255,255,0.42), transparent 34%)",
  ].join(", "),
  boxShadow: [
    "inset 0 1px 0 rgba(255,255,255,0.30)",
    "inset 0 -1px 0 rgba(15,23,42,0.34)",
    "0 6px 14px rgba(0,0,0,0.22)",
  ].join(", "),
  backdropFilter: "blur(14px) saturate(180%)",
  WebkitBackdropFilter: "blur(14px) saturate(180%)",
  color: "rgba(226,232,240,0.82)",
  display: "grid",
  placeItems: "center",
  padding: 0,
  cursor: "pointer",
  overflow: "hidden",
  transition: "background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease, transform 160ms ease",
};

const inactiveBorderColor = "rgba(255,255,255,0.18)";

export function WindowPinButton({ style }: WindowPinButtonProps) {
  const label = getCurrentWindow().label;
  const [state, setState] = useState<WindowPinState | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWindowPinState(label)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });

    let unlisten: (() => void) | null = null;
    listen<WindowPinState>(WINDOW_PIN_CHANGED_EVENT, (event) => {
      if (event.payload.label === label) {
        setState(event.payload);
      }
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [label]);

  if (!state?.supported) return null;

  const title = state.pinned ? "取消置顶" : "置顶";
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setWindowPinState(label, !state.pinned)
      .then(setState)
      .catch(console.error);
  };

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      data-tauri-drag-region="false"
      onClick={handleClick}
      style={{
        ...buttonStyle,
        background: state.pinned
          ? [
              "linear-gradient(180deg, rgba(191,219,254,0.36), rgba(59,130,246,0.16) 48%, rgba(30,41,59,0.28))",
              "radial-gradient(circle at 35% 18%, rgba(255,255,255,0.48), transparent 34%)",
            ].join(", ")
          : buttonStyle.background,
        borderColor: state.pinned ? "rgba(147,197,253,0.48)" : inactiveBorderColor,
        boxShadow: state.pinned
          ? [
              "inset 0 1px 0 rgba(255,255,255,0.36)",
              "inset 0 -1px 0 rgba(30,64,175,0.26)",
              "0 0 0 1px rgba(96,165,250,0.20)",
              "0 6px 16px rgba(37,99,235,0.24)",
            ].join(", ")
          : buttonStyle.boxShadow,
        color: state.pinned ? "rgba(239,246,255,0.98)" : buttonStyle.color,
        ...style,
      }}
    >
      <PinIcon
        size={17}
        decorative
        style={{
          filter: state.pinned
            ? "drop-shadow(0 1px 1px rgba(15,23,42,0.32))"
            : "drop-shadow(0 1px 1px rgba(0,0,0,0.34))",
        }}
      />
    </button>
  );
}
