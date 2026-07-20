import { useState } from "react";
import type { CSSProperties } from "react";
import type { Action } from "@/types/actions";
import {
  PET_BUTTON_SIZE,
  PET_OPEN_WINDOW_SIZE,
  buildPetMenuItems,
  type PetMenuItem,
} from "./petLayout";
import { PetRadialMenu } from "./PetRadialMenu";

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
  boxShadow: "none",
  display: "grid",
  gridTemplateColumns: "1fr 1.1fr",
  overflow: "hidden",
};

const previewActions: Action[] = [
  { type: "builtin", name: "搜索", feature: "screenshot" },
  { type: "builtin", name: "报告", feature: "screenshotai" },
  { type: "builtin", name: "剪贴", feature: "clipboard" },
];

const previewMenuItems = buildPetMenuItems(previewActions);

export function BrowserPreviewApp() {
  const [open, setOpen] = useState(true);
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState("尚未执行");

  const activateItem = (item: PetMenuItem) => {
    setActiveItemKey(null);
    setLastAction(item.label);
    setOpen(false);
  };

  return (
    <div style={pageStyle}>
      <div className="motion-panel" style={panelStyle}>
        <section style={{ padding: "28px 30px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 13, color: "rgba(125,211,252,0.9)", fontWeight: 700 }}>Browser Preview</div>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2, letterSpacing: 0 }}>电子宠物入口动效预览</h1>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.56)", fontSize: 13, lineHeight: 1.7 }}>
            这个页面不读取 keyboard.yaml，也不调用 Tauri API。单击宠物开关轮盘，点击扇区执行。
          </p>
          <button
            className="quick-action-icon"
            type="button"
            onClick={() => setOpen((value) => !value)}
            style={{ width: 120, height: 36, marginTop: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", cursor: "pointer", fontWeight: 700 }}
          >
            {open ? "收起" : "展开"}
          </button>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>
            最近执行：{lastAction}
          </div>
        </section>

        <section style={{ minHeight: 440, display: "grid", placeItems: "center", position: "relative", overflow: "hidden" }}>
          <PetRadialMenu
            className={`pet-bubble-menu ${open ? "is-open" : ""}`}
            items={previewMenuItems}
            open={open}
            activeItemKey={activeItemKey}
            onActiveItemChange={setActiveItemKey}
            onActivateItem={activateItem}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: PET_OPEN_WINDOW_SIZE.width,
              height: PET_OPEN_WINDOW_SIZE.height,
              transform: open
                ? "translate(-50%, -50%) scale(1)"
                : "translate(-50%, -50%) scale(0.94)",
              opacity: open ? 1 : 0,
              visibility: open ? "visible" : "hidden",
              pointerEvents: "none",
              transition: "opacity 180ms ease, transform 220ms cubic-bezier(.16,1,.3,1)",
            }}
          />

          <button
            className="preview-cat-button"
            type="button"
            aria-label="预览像素猫入口"
            title={open ? "点击收起" : "点击展开"}
            onClick={() => setOpen((value) => !value)}
            style={{
              width: PET_BUTTON_SIZE.width,
              height: PET_BUTTON_SIZE.height,
              border: 0,
              background: "transparent",
              boxShadow: "none",
            }}
          >
            <span className="pet-siamese-frame" aria-hidden="true">
              <img src="/pet/siamese/cozy-tail-ear-wiggle/0001.png" alt="" draggable={false} />
            </span>
          </button>
        </section>
      </div>
    </div>
  );
}
