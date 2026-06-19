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
  width: 22,
  height: 22,
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.72)",
  display: "grid",
  placeItems: "center",
  padding: 0,
  cursor: "pointer",
};

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
        background: state.pinned ? "rgba(96,165,250,0.22)" : buttonStyle.background,
        color: state.pinned ? "rgba(191,219,254,0.96)" : buttonStyle.color,
        ...style,
      }}
    >
      <PinIcon size={14} decorative />
    </button>
  );
}
