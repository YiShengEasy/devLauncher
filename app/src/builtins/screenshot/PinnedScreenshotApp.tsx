import { useEffect, useMemo, useState, type WheelEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CloseIcon } from "@/icons/controlIcons";

interface PinnedScreenshotPayload {
  data: string;
  width: number;
  height: number;
}

export function PinnedScreenshotApp() {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const [payload, setPayload] = useState<PinnedScreenshotPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [opacity, setOpacity] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(false);

  useEffect(() => {
    void invoke<PinnedScreenshotPayload>("get_pinned_screenshot", { label: appWindow.label })
      .then(setPayload)
      .catch((err) => setError(String(err)));
  }, [appWindow.label]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      setOpacity((value) => Math.max(0.25, Math.min(1, value + (event.deltaY > 0 ? -0.06 : 0.06))));
      return;
    }
    setScale((value) => Math.max(0.2, Math.min(4, value + (event.deltaY > 0 ? -0.08 : 0.08))));
  };

  const imageSrc = payload ? `data:image/png;base64,${payload.data}` : "";

  return (
    <div
      onMouseEnter={() => setControlsVisible(true)}
      onMouseLeave={() => setControlsVisible(false)}
      onWheel={handleWheel}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "transparent",
        userSelect: "none",
      }}
    >
      <div
        onMouseDown={(event) => {
          if (event.button === 0) void appWindow.startDragging();
        }}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
        }}
      >
        {payload && (
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: "100%",
              transform: `scale(${scale})`,
              transformOrigin: "center",
              opacity,
              filter: "drop-shadow(0 14px 34px rgba(0,0,0,0.35))",
              pointerEvents: "none",
            }}
          />
        )}

        {error && (
          <div
            style={{
              color: "rgba(255,255,255,0.92)",
              background: "rgba(20,20,24,0.88)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {controlsVisible && (
        <div
          onMouseDown={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 10,
            background: "rgba(20,20,24,0.78)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, fontWeight: 700 }}>
            {Math.round(scale * 100)}%
          </span>
          <input
            aria-label="透明度"
            type="range"
            min={0.25}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            style={{ width: 72 }}
          />
          <button
            title="关闭"
            onClick={() => void appWindow.close()}
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 8,
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.86)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
