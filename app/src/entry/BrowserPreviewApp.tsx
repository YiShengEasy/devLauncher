import type { CSSProperties } from "react";
import { useState } from "react";
import { ClipIcon, KeyboardIcon, PixelPetIcon, ReportIcon, SearchIcon } from "@/icons/entryIcons";

type PreviewAction = "search" | "report" | "clip" | "keyboard";

const actions: Array<{ action: PreviewAction; label: string; x: number; y: number }> = [
  { action: "search", label: "搜索", x: 0, y: -92 },
  { action: "report", label: "报告", x: 92, y: 0 },
  { action: "clip", label: "剪贴", x: 0, y: 92 },
  { action: "keyboard", label: "键盘", x: -92, y: 0 },
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
  return <KeyboardIcon {...iconProps} />;
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
          <div className={`pet-ring ${open ? "is-open" : ""}`} style={{ position: "relative", width: 232, height: 232, borderRadius: "50%", background: "radial-gradient(circle, rgba(12,16,24,0.76) 0 32%, rgba(12,16,24,0.94) 33% 65%, rgba(255,255,255,0.08) 66% 67%, transparent 68%)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 18px 46px rgba(0,0,0,0.38)", transform: open ? "scale(1)" : "scale(0.72)", opacity: open ? 1 : 0.45, transition: "opacity 180ms ease, transform 220ms cubic-bezier(.2,.85,.2,1)" }}>
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
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(22,27,38,0.96)",
                  color: "rgba(255,255,255,0.9)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)",
                  transform: open ? `translate(calc(-50% + ${item.x}px), calc(-50% + ${item.y}px)) var(--pet-action-hover-transform, skew(0deg, 0deg))` : "translate(-50%, -50%) scale(0.55)",
                  opacity: open ? 1 : 0,
                }}
              >
                <PreviewIcon action={item.action} />
              </button>
            ))}
          </div>

          <button className="preview-cat-button" type="button" onClick={() => setOpen((value) => !value)}>
            <PixelPetIcon size={42} decorative />
          </button>
        </section>
      </div>
    </div>
  );
}
