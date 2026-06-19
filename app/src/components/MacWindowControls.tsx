import { useState } from "react";
import type { CSSProperties } from "react";
import { CloseIcon, MinimizeIcon } from "@/icons";
import { WindowPinButton } from "@/components/WindowPinButton";

interface MacWindowControlsProps {
  onClose: () => void;
  onMinimize?: () => void;
  closeTitle?: string;
  minimizeTitle?: string;
  showPin?: boolean;
  style?: CSSProperties;
}

const controlStyle: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: "50%",
  border: "1px solid rgba(0,0,0,0.18)",
  padding: 0,
  cursor: "pointer",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), 0 1px 5px rgba(0,0,0,0.24)",
};

function symbolStyle(visible: boolean, color: string): CSSProperties {
  return {
    display: "block",
    margin: "0 auto",
    color,
    opacity: visible ? 1 : 0,
    transition: "opacity 0.12s",
  };
}

export function MacWindowControls({
  onClose,
  onMinimize,
  closeTitle = "关闭",
  minimizeTitle = "最小化",
  showPin = true,
  style,
}: MacWindowControlsProps) {
  const [hovered, setHovered] = useState<"close" | "minimize" | null>(null);

  return (
    <div
      data-tauri-drag-region="false"
      style={{ display: "flex", gap: 8, alignItems: "center", ...style }}
    >
      {showPin && <WindowPinButton style={{ marginRight: 2 }} />}
      <button
        type="button"
        aria-label={closeTitle}
        title={closeTitle}
        className="mac-window-control mac-window-control-close"
        onClick={onClose}
        onMouseEnter={() => setHovered("close")}
        onMouseLeave={() => setHovered(null)}
        style={{ ...controlStyle, background: "#ff5f57" }}
      >
        <CloseIcon size={9} decorative style={symbolStyle(hovered === "close", "rgba(80,0,0,0.55)")} />
      </button>
      {onMinimize && (
        <button
          type="button"
          aria-label={minimizeTitle}
          title={minimizeTitle}
          className="mac-window-control mac-window-control-minimize"
          onClick={onMinimize}
          onMouseEnter={() => setHovered("minimize")}
          onMouseLeave={() => setHovered(null)}
          style={{ ...controlStyle, background: "#ffbd2e" }}
        >
          <MinimizeIcon size={9} decorative style={symbolStyle(hovered === "minimize", "rgba(90,50,0,0.62)")} />
        </button>
      )}
    </div>
  );
}
