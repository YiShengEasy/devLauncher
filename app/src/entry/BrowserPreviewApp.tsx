import type { CSSProperties } from "react";
import { useState } from "react";
import { ClipIcon, KeyboardIcon, ReportIcon, SearchIcon } from "@/icons/entryIcons";

type PreviewAction = "search" | "report" | "clip" | "keyboard" | "custom-action";

const actions: Array<{ action: PreviewAction; label: string; x: number; y: number }> = [
  { action: "search", label: "搜索", x: -72, y: 0 },
  { action: "report", label: "报告", x: -36, y: 0 },
  { action: "clip", label: "剪贴", x: 0, y: 0 },
  { action: "keyboard", label: "键盘", x: 36, y: 0 },
  { action: "custom-action", label: "动作", x: 72, y: 0 },
];

const pageStyle: CSSProperties = {
  width: "100vw",
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #10121f 0%, #171923 48%, #0d1117 100%)",
  color: "rgba(255,255,255,0.9)",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  padding: 24,
};

const panelStyle: CSSProperties = {
  width: "min(760px, calc(100vw - 32px))",
  minHeight: 440,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(22, 25, 38, 0.78)",
  boxShadow: "0 28px 80px rgba(0,0,0,0.38)",
  display: "grid",
  gridTemplateColumns: "1fr 1.1fr",
  overflow: "hidden",
};

function PreviewIcon({ action }: { action: PreviewAction }) {
  const iconProps = { size: 28, decorative: true };
  if (action === "search") return <SearchIcon {...iconProps} />;
  if (action === "report") return <ReportIcon {...iconProps} />;
  if (action === "clip") return <ClipIcon {...iconProps} />;
  if (action === "keyboard") return <KeyboardIcon {...iconProps} />;
  return <span className="pet-action-plus" aria-hidden="true">+</span>;
}

export function BrowserPreviewApp() {
  const [open, setOpen] = useState(true);

  return (
    <div style={pageStyle}>
      <div className="motion-panel" style={panelStyle}>
        <section style={{ padding: "28px 30px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 13, color: "rgba(125,211,252,0.9)", fontWeight: 700 }}>Browser Preview</div>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2, letterSpacing: 0 }}>电子宠物入口动效预览</h1>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.56)", fontSize: 13, lineHeight: 1.7 }}>
            这个页面不读取 keyboard.yaml，也不调用 Tauri API。用于在浏览器里检查宠物展开、SVG 图标和 hover 动画。
          </p>
          <button
            className="quick-action-icon"
            type="button"
            onClick={() => setOpen((value) => !value)}
            style={{ width: 120, height: 36, marginTop: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", cursor: "pointer", fontWeight: 700 }}
          >
            {open ? "收起" : "展开"}
          </button>
        </section>

        <section style={{ minHeight: 440, display: "grid", placeItems: "center", position: "relative", overflow: "hidden" }}>
          <div className={`pet-bubble-menu ${open ? "is-open" : ""}`} style={{ position: "absolute", left: "50%", top: 56, width: 194, height: 42, borderRadius: 6, background: "rgba(12,18,28,0.96)", border: "2px solid rgba(248,250,252,0.72)", boxShadow: "0 4px 0 rgba(0,0,0,0.32), inset 0 -2px 0 rgba(15,23,42,0.72)", transform: open ? "translateX(-50%) translateY(0) scale(1)" : "translateX(-50%) translateY(6px) scale(0.94)", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity 180ms ease, transform 220ms cubic-bezier(.16,1,.3,1)" }}>
            {actions.map((item) => (
              <button
                key={item.action}
                className="pet-action-button"
                type="button"
                title={item.label}
                data-pet-action={item.action}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 32,
                  height: 32,
                  borderRadius: 5,
                  border: "2px solid rgba(226,232,240,0.68)",
                  background: "rgba(30,41,59,0.98)",
                  color: "rgba(255,255,255,0.9)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 3px 0 rgba(0,0,0,0.35)",
                  transform: open ? `translate(calc(-50% + ${item.x}px), calc(-50% + ${item.y}px)) var(--pet-action-hover-transform, skew(0deg, 0deg))` : "translate(-50%, -50%) scale(0.72)",
                  opacity: open ? 1 : 0,
                }}
              >
                <PreviewIcon action={item.action} />
              </button>
            ))}
          </div>

          <button className="preview-cat-button" type="button" onClick={() => setOpen((value) => !value)} style={{ width: 148, height: 132, border: 0, background: "transparent", boxShadow: "none" }}>
            <span className="pet-siamese-frame" aria-hidden="true">
              <img src="/pet/siamese/cozy-tail-ear-wiggle/0001.png" alt="" draggable={false} />
            </span>
          </button>
        </section>
      </div>
    </div>
  );
}
