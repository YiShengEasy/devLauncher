import { useEffect, useRef, useState, useCallback } from "react";
import type { CSSProperties, MouseEvent as RMouseEvent, ReactElement } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as dialogSave } from "@tauri-apps/plugin-dialog";
import { addScreenshot } from "../screenshotStore";

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = "init" | "selecting" | "annotating";
type Tool = "rect" | "ellipse" | "arrow" | "pencil" | "text" | "mosaic";

interface Pt { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }

type Ann =
  | { t: "rect";    rect: Rect; color: string; lw: number }
  | { t: "ellipse"; rect: Rect; color: string; lw: number }
  | { t: "arrow";   p1: Pt; p2: Pt; color: string; lw: number }
  | { t: "pencil";  pts: Pt[]; color: string; lw: number }
  | { t: "text";    pos: Pt; text: string; color: string; fs: number }
  | { t: "mosaic";  rect: Rect };

// ── Constants ─────────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#ffffff", "#ff3b30", "#ff9500", "#ffcc00",
  "#34c759", "#007aff", "#af52de", "#1c1c1e",
];
const LINE_WIDTHS = [2, 4, 6];
const HANDLE_R = 5;
const SEL_COLOR = "rgba(78, 186, 255, 0.9)";

// ── Rect helpers ──────────────────────────────────────────────────────────────
function norm(r: Rect): Rect {
  return {
    x: Math.min(r.x, r.x + r.w),
    y: Math.min(r.y, r.y + r.h),
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

/** 8 handle points: TL TC TR ML MR BL BC BR */
function getHandles(r: Rect): Pt[] {
  const { x, y, w, h } = norm(r);
  return [
    { x,       y       }, // 0 TL
    { x: x+w/2, y      }, // 1 TC
    { x: x+w,   y      }, // 2 TR
    { x,        y: y+h/2 }, // 3 ML
    { x: x+w,   y: y+h/2 }, // 4 MR
    { x,        y: y+h  }, // 5 BL
    { x: x+w/2, y: y+h  }, // 6 BC
    { x: x+w,   y: y+h  }, // 7 BR
  ];
}

function hitHandle(pt: Pt, r: Rect): number {
  return getHandles(r).findIndex(h => Math.hypot(pt.x - h.x, pt.y - h.y) <= 9);
}

function inRect(pt: Pt, r: Rect): boolean {
  const n = norm(r);
  return pt.x >= n.x && pt.x <= n.x + n.w && pt.y >= n.y && pt.y <= n.y + n.h;
}

function resizeRect(base: Rect, hi: number, start: Pt, cur: Pt): Rect {
  const n = norm(base);
  const dx = cur.x - start.x;
  const dy = cur.y - start.y;
  let { x, y, w, h } = n;
  if ([0, 3, 5].includes(hi)) { x += dx; w -= dx; }
  if ([2, 4, 7].includes(hi)) { w += dx; }
  if ([0, 1, 2].includes(hi)) { y += dy; h -= dy; }
  if ([5, 6, 7].includes(hi)) { h += dy; }
  return { x, y, w: Math.max(4, w), h: Math.max(4, h) };
}

// ── Canvas drawing helpers ────────────────────────────────────────────────────
function drawArrow(ctx: CanvasRenderingContext2D, p1: Pt, p2: Pt) {
  const ARROW_LEN = 14;
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p2.x, p2.y);
  ctx.lineTo(p2.x - ARROW_LEN * Math.cos(angle - 0.42), p2.y - ARROW_LEN * Math.sin(angle - 0.42));
  ctx.lineTo(p2.x - ARROW_LEN * Math.cos(angle + 0.42), p2.y - ARROW_LEN * Math.sin(angle + 0.42));
  ctx.closePath();
  ctx.fill();
}

function renderAnnotation(ctx: CanvasRenderingContext2D, ann: Ann, bgImg?: HTMLImageElement) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  switch (ann.t) {
    case "rect": {
      const { x, y, w, h } = norm(ann.rect);
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.lw;
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case "ellipse": {
      const { x, y, w, h } = norm(ann.rect);
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.lw;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "arrow": {
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = ann.lw;
      drawArrow(ctx, ann.p1, ann.p2);
      break;
    }
    case "pencil": {
      if (ann.pts.length < 2) break;
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.lw;
      ctx.beginPath();
      ctx.moveTo(ann.pts[0].x, ann.pts[0].y);
      for (let i = 1; i < ann.pts.length; i++) ctx.lineTo(ann.pts[i].x, ann.pts[i].y);
      ctx.stroke();
      break;
    }
    case "text": {
      ctx.fillStyle = ann.color;
      ctx.font = `bold ${ann.fs}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
      ctx.textBaseline = "top";
      // Subtle text shadow for readability
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 3;
      ctx.fillText(ann.text, ann.pos.x, ann.pos.y);
      break;
    }
    case "mosaic": {
      if (!bgImg) break;
      const { x, y, w, h } = norm(ann.rect);
      if (w < 4 || h < 4) break;
      const BLOCK = 10;
      const sw = Math.max(1, Math.round(w / BLOCK));
      const sh = Math.max(1, Math.round(h / BLOCK));
      const offscreen = document.createElement("canvas");
      offscreen.width = sw;
      offscreen.height = sh;
      const oc = offscreen.getContext("2d", { willReadFrequently: true })!;
      oc.drawImage(bgImg, x, y, w, h, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, 0, 0, sw, sh, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
      break;
    }
  }
  ctx.restore();
}

function renderFrame(
  canvas: HTMLCanvasElement,
  bgImg: HTMLImageElement | null,
  phase: Phase,
  sel: Rect | null,
  anns: Ann[],
  curAnn: Ann | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  ctx.clearRect(0, 0, W, H);

  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, W, H);
  }

  if (phase === "selecting" || phase === "annotating") {
    // Dark overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
    ctx.fillRect(0, 0, W, H);

    if (sel) {
      const n = norm(sel);

      // Reveal selected area from background
      if (bgImg) ctx.drawImage(bgImg, n.x, n.y, n.w, n.h, n.x, n.y, n.w, n.h);

      // Annotations on top of the revealed area
      for (const ann of anns) renderAnnotation(ctx, ann, bgImg ?? undefined);
      if (curAnn) renderAnnotation(ctx, curAnn, bgImg ?? undefined);

      // Selection border — two-tone for visibility on any bg
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.strokeRect(n.x - 1, n.y - 1, n.w + 2, n.h + 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = SEL_COLOR;
      ctx.strokeRect(n.x, n.y, n.w, n.h);

      // Corner handles
      for (const h of getHandles(n)) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = SEL_COLOR;
        ctx.stroke();
      }

      // Dimension label
      const label = `${Math.round(n.w)} × ${Math.round(n.h)}`;
      ctx.font = "bold 12px -apple-system, monospace";
      const tw = ctx.measureText(label).width;
      const LH = 20;
      const lx = Math.max(2, n.x);
      const ly = n.y > LH + 6 ? n.y - LH - 4 : n.y + n.h + 4;
      // Label background
      ctx.fillStyle = SEL_COLOR;
      const rx = lx - 4, ry = ly, rw = tw + 10, rh = LH;
      ctx.beginPath();
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(rx, ry, rw, rh, 4);
      } else {
        ctx.rect(rx, ry, rw, rh);
      }
      ctx.fill();
      // Label text
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.textBaseline = "middle";
      ctx.fillText(label, lx + 1, ly + LH / 2);
    }
  }
}

// ── ArrayBuffer → base64 (chunked, avoids stack overflow) ────────────────────
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
  }
  return btoa(binary);
}

// ── Tool icon components (pure SVG) ──────────────────────────────────────────
function IconRect() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}
function IconEllipse() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="12" rx="9" ry="7" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <line x1="5" y1="19" x2="19" y2="5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <polyline points="10,5 19,5 19,14" stroke="currentColor" strokeWidth={2} fill="none" strokeLinejoin="round" />
    </svg>
  );
}
function IconPencil() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}
function IconText() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
      <text x="5" y="19" fontSize="17" fontFamily="sans-serif" fontWeight="bold">T</text>
    </svg>
  );
}
function IconMosaic() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2"  y="2"  width="9" height="9" rx="1" opacity="0.9" />
      <rect x="13" y="2"  width="9" height="9" rx="1" opacity="0.5" />
      <rect x="2"  y="13" width="9" height="9" rx="1" opacity="0.5" />
      <rect x="13" y="13" width="9" height="9" rx="1" opacity="0.9" />
    </svg>
  );
}
function IconUndo() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}
function IconSave() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function IconCopy() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z" />
    </svg>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
const TOOLS: { key: Tool; icon: () => ReactElement; title: string }[] = [
  { key: "rect",    icon: IconRect,    title: "矩形 (R)" },
  { key: "ellipse", icon: IconEllipse, title: "椭圆 (E)" },
  { key: "arrow",   icon: IconArrow,   title: "箭头 (A)" },
  { key: "pencil",  icon: IconPencil,  title: "画笔 (P)" },
  { key: "text",    icon: IconText,    title: "文字 (T)" },
  { key: "mosaic",  icon: IconMosaic,  title: "马赛克 (M)" },
];

interface ToolbarProps {
  activeTool: Tool | null;
  activeColor: string;
  activeLw: number;
  onTool: (t: Tool | null) => void;
  onColor: (c: string) => void;
  onLw: (lw: number) => void;
  onUndo: () => void;
  onCopy: () => void;
  onSave: () => void;
  onPin: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  style: CSSProperties;
}

function Toolbar({
  activeTool, activeColor, activeLw,
  onTool, onColor, onLw,
  onUndo, onCopy, onSave, onPin,
  onCancel, onConfirm,
  style,
}: ToolbarProps) {
  const baseBtn: CSSProperties = {
    width: 34,
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    color: "rgba(255,255,255,0.78)",
    flexShrink: 0,
    padding: 0,
    transition: "background 0.12s, color 0.12s",
  };
  const activeToolBtn: CSSProperties = {
    background: "rgba(78, 186, 255, 0.18)",
    border: "1px solid rgba(78, 186, 255, 0.55)",
    color: "#4ebaff",
  };
  const sep: CSSProperties = {
    width: 1, height: 22,
    background: "rgba(255,255,255,0.13)",
    margin: "0 5px",
    flexShrink: 0,
  };

  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "7px 12px",
        background: "rgba(20, 20, 24, 0.92)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 36px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.07) inset",
        userSelect: "none",
        zIndex: 9999,
        ...style,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Drawing tool buttons */}
      {TOOLS.map(({ key, icon: Icon, title }) => (
        <button
          key={key}
          title={title}
          onClick={() => onTool(activeTool === key ? null : key)}
          style={{ ...baseBtn, ...(activeTool === key ? activeToolBtn : {}) }}
        >
          <Icon />
        </button>
      ))}

      <div style={sep} />

      {/* Color swatches */}
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onColor(c)}
          title={c}
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: c,
            border: activeColor === c
              ? "2.5px solid white"
              : "2px solid rgba(255,255,255,0.25)",
            outline: activeColor === c ? "1.5px solid rgba(78,186,255,0.8)" : "none",
            outlineOffset: 1,
            cursor: "pointer",
            flexShrink: 0,
            padding: 0,
          }}
        />
      ))}

      <div style={sep} />

      {/* Line width pills */}
      {LINE_WIDTHS.map(lw => (
        <button
          key={lw}
          title={`线宽 ${lw}px`}
          onClick={() => onLw(lw)}
          style={{
            ...baseBtn,
            width: 32,
            background: activeLw === lw ? "rgba(255,255,255,0.12)" : "transparent",
            border: activeLw === lw ? "1px solid rgba(255,255,255,0.22)" : "1px solid transparent",
          }}
        >
          <div style={{
            width: 16,
            height: lw + 1,
            background: "rgba(255,255,255,0.82)",
            borderRadius: (lw + 1) / 2,
          }} />
        </button>
      ))}

      <div style={sep} />

      {/* Actions */}
      <button title="撤销 (Ctrl+Z)" onClick={onUndo} style={baseBtn}>
        <IconUndo />
      </button>
      <button title="保存图片" onClick={onSave} style={baseBtn}>
        <IconSave />
      </button>
      <button title="复制到剪贴板" onClick={onCopy} style={baseBtn}>
        <IconCopy />
      </button>
      <button title="存入截图库" onClick={onPin} style={baseBtn}>
        <IconPin />
      </button>

      <div style={sep} />

      {/* Cancel — red Mac button */}
      <button
        title="取消 (Esc)"
        onClick={onCancel}
        style={{
          ...baseBtn,
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: "rgba(255,59,48,0.85)",
          color: "white",
          fontSize: 13,
          fontWeight: "bold",
        }}
      >
        ✕
      </button>

      {/* Confirm — green Mac button */}
      <button
        title="完成复制 (Enter)"
        onClick={onConfirm}
        style={{
          ...baseBtn,
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: "rgba(52,199,89,0.88)",
          color: "white",
          fontSize: 15,
          fontWeight: "bold",
        }}
      >
        ✓
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ScreenshotApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImgRef  = useRef<HTMLImageElement | null>(null);

  // ── React state (drives JSX) ─────────────────────────────────────────────
  const [phase,       setPhaseState]  = useState<Phase>("init");
  const [selection,   setSelState]    = useState<Rect | null>(null);
  const [activeTool,  setToolState]   = useState<Tool | null>(null);
  const [activeColor, setColorState]  = useState("#ff3b30");
  const [activeLw,    setLwState]     = useState(2);
  const [textInput,   setTextInput]   = useState<{ pos: Pt; val: string } | null>(null);

  // ── Refs (fast access in canvas callbacks without stale closures) ─────────
  const phaseRef  = useRef<Phase>("init");
  const selRef    = useRef<Rect | null>(null);
  const annsRef   = useRef<Ann[]>([]);
  const undoRef   = useRef<Ann[][]>([]);
  const toolRef   = useRef<Tool | null>(null);
  const colorRef  = useRef("#ff3b30");
  const lwRef     = useRef(2);
  const curAnnRef = useRef<Ann | null>(null);
  const dragRef   = useRef<{
    mode: "sel-new" | "sel-move" | "sel-resize" | "ann";
    startMouse: Pt;
    initSel?: Rect;
    handleIdx?: number;
  } | null>(null);

  // Synced setters
  const setPhase = (p: Phase)           => { phaseRef.current = p;  setPhaseState(p); };
  const setSel   = (r: Rect | null)     => { selRef.current = r;    setSelState(r); };
  const setTool  = (t: Tool | null)     => { toolRef.current = t;   setToolState(t); };
  const setColor = (c: string)          => { colorRef.current = c;  setColorState(c); };
  const setLw    = (lw: number)         => { lwRef.current = lw;    setLwState(lw); };

  // ── Canvas render ─────────────────────────────────────────────────────────
  const doRender = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderFrame(canvas, bgImgRef.current, phaseRef.current, selRef.current, annsRef.current, curAnnRef.current);
  }, []);

  // ── Resize canvas to current window dimensions and restore DPR scale ──────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + "px";
    canvas.style.height = H + "px";
    // Setting canvas.width resets the context — must re-apply scale
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  // ── Load a base64 PNG as the background and enter selecting phase ─────────
  const loadScreenshotData = useCallback((data: string) => {
    // Reset all editing state before loading new screenshot
    selRef.current      = null;
    annsRef.current     = [];
    curAnnRef.current   = null;
    undoRef.current     = [];
    dragRef.current     = null;
    bgImgRef.current    = null;
    setSelState(null);
    setTextInput(null);
    setToolState(null);
    toolRef.current = null;
    phaseRef.current = "init";
    setPhaseState("init");

    resizeCanvas();

    const img = new Image();
    img.onload = () => {
      bgImgRef.current = img;
      phaseRef.current = "selecting";
      setPhaseState("selecting");
      renderFrame(
        canvasRef.current!,
        bgImgRef.current,
        phaseRef.current,
        selRef.current,
        annsRef.current,
        curAnnRef.current,
      );
    };
    img.src = "data:image/png;base64," + data;
  }, [resizeCanvas]);

  // ── Init: size canvas, set up keyboard + screenshot-ready listener ────────
  useEffect(() => {
    resizeCanvas();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")                                        handleCancel();
      if (e.key === "Enter" && phaseRef.current === "annotating")   void handleConfirm();
      if ((e.metaKey || e.ctrlKey) && e.key === "z")                handleUndo();
      if (e.key === "r" || e.key === "R")  setTool("rect");
      if (e.key === "e" || e.key === "E")  setTool("ellipse");
      if (e.key === "a" || e.key === "A")  setTool("arrow");
      if (e.key === "p" || e.key === "P")  setTool("pencil");
      if (e.key === "t" || e.key === "T")  setTool("text");
      if (e.key === "m" || e.key === "M")  setTool("mosaic");
    };
    window.addEventListener("keydown", onKey);

    // Rust emits this event every time a new screenshot is ready.
    // Payload IS the base64 JPEG string — no second IPC call needed.
    const unlistenPromise = listen<string>("screenshot-ready", (event) => {
      if (event.payload) loadScreenshotData(event.payload);
    });

    return () => {
      window.removeEventListener("keydown", onKey);
      unlistenPromise.then(fn => fn());
    };
  }, [resizeCanvas, loadScreenshotData]);

  // ── Mouse position helper ─────────────────────────────────────────────────
  const getPos = (e: RMouseEvent<HTMLCanvasElement>): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ── Mouse Down ────────────────────────────────────────────────────────────
  const onMouseDown = (e: RMouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || textInput) return;
    const pos  = getPos(e);
    const ph   = phaseRef.current;
    const sel  = selRef.current;
    const tool = toolRef.current;

    if (ph === "selecting") {
      if (sel) {
        const hi = hitHandle(pos, sel);
        if (hi >= 0) {
          dragRef.current = { mode: "sel-resize", startMouse: pos, initSel: { ...norm(sel) }, handleIdx: hi };
          return;
        }
        if (inRect(pos, sel)) {
          dragRef.current = { mode: "sel-move", startMouse: pos, initSel: { ...norm(sel) } };
          return;
        }
      }
      dragRef.current = { mode: "sel-new", startMouse: pos };
      setSel({ x: pos.x, y: pos.y, w: 0, h: 0 });

    } else if (ph === "annotating") {
      if (!tool) {
        if (sel) {
          const hi = hitHandle(pos, sel);
          if (hi >= 0) {
            dragRef.current = { mode: "sel-resize", startMouse: pos, initSel: { ...norm(sel) }, handleIdx: hi };
            return;
          }
          if (inRect(pos, norm(sel))) {
            dragRef.current = { mode: "sel-move", startMouse: pos, initSel: { ...norm(sel) } };
            return;
          }
        }
        return;
      }

      if (tool === "text") {
        setTextInput({ pos, val: "" });
        return;
      }

      const color = colorRef.current;
      const lw    = lwRef.current;
      let initAnn: Ann | undefined;
      if (tool === "rect")    initAnn = { t: "rect",    rect: { x: pos.x, y: pos.y, w: 0, h: 0 }, color, lw };
      if (tool === "ellipse") initAnn = { t: "ellipse", rect: { x: pos.x, y: pos.y, w: 0, h: 0 }, color, lw };
      if (tool === "arrow")   initAnn = { t: "arrow",   p1: pos, p2: pos, color, lw };
      if (tool === "pencil")  initAnn = { t: "pencil",  pts: [pos], color, lw };
      if (tool === "mosaic")  initAnn = { t: "mosaic",  rect: { x: pos.x, y: pos.y, w: 0, h: 0 } };

      if (initAnn) {
        curAnnRef.current = initAnn;
        dragRef.current = { mode: "ann", startMouse: pos };
      }
    }
  };

  // ── Mouse Move ────────────────────────────────────────────────────────────
  const onMouseMove = (e: RMouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    const dr  = dragRef.current;
    if (!dr) return;

    if (dr.mode === "sel-new") {
      selRef.current = { x: dr.startMouse.x, y: dr.startMouse.y, w: pos.x - dr.startMouse.x, h: pos.y - dr.startMouse.y };
    } else if (dr.mode === "sel-move") {
      const dx = pos.x - dr.startMouse.x;
      const dy = pos.y - dr.startMouse.y;
      const s  = dr.initSel!;
      selRef.current = { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
    } else if (dr.mode === "sel-resize") {
      selRef.current = resizeRect(dr.initSel!, dr.handleIdx!, dr.startMouse, pos);
    } else if (dr.mode === "ann" && curAnnRef.current) {
      const ann = curAnnRef.current;
      if (ann.t === "rect" || ann.t === "ellipse" || ann.t === "mosaic") {
        (ann as Ann & { rect: Rect }).rect = {
          x: dr.startMouse.x, y: dr.startMouse.y,
          w: pos.x - dr.startMouse.x, h: pos.y - dr.startMouse.y,
        };
      } else if (ann.t === "arrow") {
        ann.p2 = pos;
      } else if (ann.t === "pencil") {
        ann.pts.push(pos);
      }
    }
    doRender();
  };

  // ── Mouse Up ──────────────────────────────────────────────────────────────
  const onMouseUp = (_e: RMouseEvent<HTMLCanvasElement>) => {
    const dr = dragRef.current;
    dragRef.current = null;
    if (!dr) return;

    if (dr.mode === "sel-new" || dr.mode === "sel-move" || dr.mode === "sel-resize") {
      const sel = selRef.current;
      if (sel) {
        const n = norm(sel);
        if (n.w > 4 && n.h > 4) {
          setSel(n);
          if (dr.mode === "sel-new" && phaseRef.current === "selecting") {
            setPhase("annotating");
            setTool(null);
          }
        } else if (dr.mode === "sel-new") {
          setSel(null);
        }
      }
      doRender();

    } else if (dr.mode === "ann") {
      const ann = curAnnRef.current;
      curAnnRef.current = null;
      if (ann) {
        let valid = true;
        if ((ann.t === "rect" || ann.t === "ellipse" || ann.t === "mosaic") &&
            (Math.abs(ann.rect.w) < 3 || Math.abs(ann.rect.h) < 3)) valid = false;
        if (ann.t === "arrow" && Math.hypot(ann.p2.x - ann.p1.x, ann.p2.y - ann.p1.y) < 5) valid = false;
        if (ann.t === "pencil" && ann.pts.length < 2) valid = false;

        if (valid) {
          undoRef.current.push([...annsRef.current]);
          annsRef.current = [...annsRef.current, ann];
        }
      }
      doRender();
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleUndo = () => {
    if (undoRef.current.length > 0) {
      annsRef.current = undoRef.current.pop()!;
      doRender();
    }
  };

  /** Build result canvas: selected area + annotations composited */
  const buildResult = (): HTMLCanvasElement | null => {
    const sel  = selRef.current ? norm(selRef.current) : null;
    const bgImg = bgImgRef.current;
    if (!sel || !bgImg) return null;
    const out = document.createElement("canvas");
    out.width  = Math.max(1, Math.round(sel.w));
    out.height = Math.max(1, Math.round(sel.h));
    const ctx = out.getContext("2d")!;
    ctx.drawImage(bgImg, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
    ctx.translate(-sel.x, -sel.y);
    for (const ann of annsRef.current) renderAnnotation(ctx, ann, bgImg);
    return out;
  };

  const handleCopy = async () => {
    const out = buildResult();
    if (!out) return;
    await new Promise<void>(resolve => {
      out.toBlob(async blob => {
        if (!blob) { resolve(); return; }
        try {
          const base64 = toBase64(await blob.arrayBuffer());
          await invoke("set_clipboard_image", { data: base64 });
        } catch (err) {
          console.error("copy failed", err);
        }
        resolve();
      }, "image/png");
    });
  };

  const handleSave = async () => {
    const out = buildResult();
    if (!out) return;
    out.toBlob(async blob => {
      if (!blob) return;
      try {
        const path = await dialogSave({
          filters: [{ name: "PNG Image", extensions: ["png"] }],
          defaultPath: `screenshot_${Date.now()}.png`,
        });
        if (!path) return;
        const base64 = toBase64(await blob.arrayBuffer());
        await invoke("screenshot_write_file", { path, data: base64 });
      } catch (err) {
        console.error("save failed", err);
      }
    }, "image/png");
  };

  /** Save to screenshot library (for screenshotai plugin) and close */
  const handlePin = () => {
    const out = buildResult();
    if (!out) return;
    out.toBlob(blob => {
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64  = dataUrl.split(",")[1];
        addScreenshot({ data: base64, width: out.width, height: out.height });
      };
      reader.readAsDataURL(blob);
    }, "image/jpeg", 0.92);
    handleCancel();
  };

  const handleConfirm = async () => {
    await handleCopy();
    handleCancel();
  };

  const handleCancel = () => {
    selRef.current   = null;
    annsRef.current  = [];
    curAnnRef.current = null;
    undoRef.current  = [];
    dragRef.current  = null;
    setPhase("init");
    setSel(null);
    setTextInput(null);
    doRender();
    getCurrentWindow().hide();
  };

  const handleTextConfirm = () => {
    if (!textInput) return;
    const trimmed = textInput.val.trim();
    if (trimmed) {
      undoRef.current.push([...annsRef.current]);
      const ann: Ann = {
        t: "text",
        pos: textInput.pos,
        text: trimmed,
        color: colorRef.current,
        fs: 18,
      };
      annsRef.current = [...annsRef.current, ann];
      doRender();
    }
    setTextInput(null);
  };

  // ── Cursor ────────────────────────────────────────────────────────────────
  const getCursor = () => {
    if (phase === "init")       return "default";
    if (phase === "selecting")  return "crosshair";
    if (activeTool === "text")  return "text";
    if (activeTool)             return "crosshair";
    return "default";
  };

  // ── Toolbar position (below or above selection) ───────────────────────────
  const getToolbarStyle = (): CSSProperties | null => {
    if (!selection) return null;
    const n    = norm(selection);
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const TB_W = 548;
    const TB_H = 52;
    const GAP  = 12;

    let top: number;
    if (n.y + n.h + TB_H + GAP < winH)       top = n.y + n.h + GAP;
    else if (n.y - TB_H - GAP > 0)            top = n.y - TB_H - GAP;
    else                                       top = Math.max(GAP, n.y + n.h - TB_H - 4);

    const left = Math.max(GAP, Math.min(winW - TB_W - GAP, n.x + n.w / 2 - TB_W / 2));
    return { top, left };
  };

  const tbStyle = getToolbarStyle();

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", userSelect: "none", background: "transparent" }}>
      {/* Full-screen canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: getCursor(), position: "absolute", top: 0, left: 0 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      />

      {/* Loading indicator */}
      {phase === "init" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            color: "rgba(255,255,255,0.55)", fontSize: 13,
            background: "rgba(0,0,0,0.5)", borderRadius: 10, padding: "6px 14px",
          }}>
            正在截图...
          </div>
        </div>
      )}

      {/* "Drag to select" hint */}
      {phase === "selecting" && !selection && (
        <div style={{
          position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.7)", fontSize: 13,
          background: "rgba(0,0,0,0.5)", borderRadius: 10, padding: "6px 16px",
          pointerEvents: "none",
        }}>
          拖动鼠标选择截图区域 · Esc 取消
        </div>
      )}

      {/* Mac-style toolbar */}
      {phase === "annotating" && selection && tbStyle && (
        <Toolbar
          activeTool={activeTool}
          activeColor={activeColor}
          activeLw={activeLw}
          onTool={setTool}
          onColor={setColor}
          onLw={setLw}
          onUndo={handleUndo}
          onCopy={handleCopy}
          onSave={handleSave}
          onPin={handlePin}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
          style={tbStyle}
        />
      )}

      {/* Floating text input */}
      {textInput && (
        <input
          autoFocus
          value={textInput.val}
          onChange={e => setTextInput({ ...textInput, val: e.target.value })}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); handleTextConfirm(); }
            if (e.key === "Escape") setTextInput(null);
            e.stopPropagation();
          }}
          onBlur={handleTextConfirm}
          placeholder="输入文字..."
          style={{
            position: "absolute",
            left: textInput.pos.x,
            top: textInput.pos.y,
            background: "rgba(0,0,0,0.55)",
            border: "none",
            borderBottom: `2.5px solid ${activeColor}`,
            color: activeColor,
            fontSize: 20,
            fontWeight: "bold",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            outline: "none",
            minWidth: 130,
            padding: "3px 4px",
            borderRadius: "4px 4px 0 0",
            zIndex: 10000,
          }}
        />
      )}
    </div>
  );
}
