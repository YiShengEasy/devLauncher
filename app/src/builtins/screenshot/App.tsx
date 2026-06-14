import { useEffect, useRef, useState, useCallback } from "react";
import type { CSSProperties, MouseEvent as RMouseEvent, ReactElement } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as dialogSave } from "@tauri-apps/plugin-dialog";
import { addScreenshot, takePendingScreenshotEdit, updateScreenshot } from "../screenshotStore";
import type { StoredScreenshotAnnotation } from "../screenshotStore";

// 鈹€鈹€ Types 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
type Phase = "init" | "selecting" | "annotating";
type Tool = "move" | "marker" | "boxCallout" | "rect" | "ellipse" | "arrow" | "pencil" | "text" | "mosaic";

interface Pt { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }
type TextInputState = { pos: Pt; val: string; target?: { kind: "ann-note"; annIndex: number } };

type Ann =
  | { t: "marker";  pos: Pt; label: number; color: string; note?: string }
  | { t: "boxCallout"; rect: Rect; label: number; labelPos: Pt; color: string; lw: number; note?: string }
  | { t: "rect";    rect: Rect; color: string; lw: number }
  | { t: "ellipse"; rect: Rect; color: string; lw: number }
  | { t: "arrow";   p1: Pt; p2: Pt; color: string; lw: number }
  | { t: "pencil";  pts: Pt[]; color: string; lw: number }
  | { t: "text";    pos: Pt; text: string; color: string; fs: number }
  | { t: "mosaic";  rect: Rect };

// 鈹€鈹€ Constants 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const PRESET_COLORS = [
  "#ffffff", "#ff3b30", "#ff9500", "#ffcc00",
  "#34c759", "#007aff", "#af52de", "#1c1c1e",
];
const LINE_WIDTHS = [2, 4, 6];
const HANDLE_R = 5;
const SEL_COLOR = "rgba(78, 186, 255, 0.9)";
const BADGE_R = 13;
const CALLOUT_GAP = 30;

// 鈹€鈹€ Rect helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

function nextCalloutLabel(anns: Ann[]): number {
  return anns.reduce((max, ann) => {
    if (ann.t !== "marker" && ann.t !== "boxCallout") return max;
    return Math.max(max, ann.label);
  }, 0) + 1;
}

function calloutLabelPos(rect: Rect, bounds?: Rect | null): Pt {
  const n = norm(rect);
  const below = { x: n.x + n.w / 2, y: n.y + n.h + CALLOUT_GAP };
  const bottomLimit = bounds ? norm(bounds).y + norm(bounds).h : window.innerHeight;
  if (below.y + BADGE_R + 6 <= bottomLimit) return below;
  return {
    x: n.x + n.w / 2,
    y: Math.max(BADGE_R + 6, n.y - CALLOUT_GAP),
  };
}

function toneFromColor(color: string): StoredScreenshotAnnotation["tone"] {
  const normalized = color.toLowerCase();
  if (normalized === "#34c759") return "expected";
  if (normalized === "#ffcc00" || normalized === "#ffd60a") return "focus";
  return "problem";
}

// 鈹€鈹€ Canvas drawing helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

function drawCalloutBadge(ctx: CanvasRenderingContext2D, pos: Pt, label: number, color: string) {
  const text = String(label);
  const r = Math.max(BADGE_R, 9 + text.length * 4);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 13px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.32)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillText(text, pos.x, pos.y + 0.5);
  ctx.restore();
}

function calloutTextPos(pos: Pt, label: number): Pt {
  const r = Math.max(BADGE_R, 9 + String(label).length * 4);
  const x = Math.min(window.innerWidth - 190, Math.max(8, pos.x + r + 10));
  const y = Math.min(window.innerHeight - 44, Math.max(8, pos.y - 12));
  return { x, y };
}

function drawCalloutNote(ctx: CanvasRenderingContext2D, pos: Pt, label: number, note: string | undefined) {
  const text = note?.trim();
  if (!text) return;
  const p = calloutTextPos(pos, label);
  ctx.save();
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
  ctx.textBaseline = "middle";
  const padX = 8;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 24;
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "rgba(28,28,30,0.78)";
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(p.x, p.y, w, h, 8);
  } else {
    ctx.rect(p.x, p.y, w, h);
  }
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(text, p.x + padX, p.y + h / 2 + 0.5);
  ctx.restore();
}

function boxCalloutTarget(rect: Rect, labelPos: Pt): Pt {
  const n = norm(rect);
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = labelPos.x - cx;
  const dy = labelPos.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: dx >= 0 ? n.x + n.w : n.x, y: cy };
  }
  return { x: cx, y: dy >= 0 ? n.y + n.h : n.y };
}

function hitAnnotation(pt: Pt, anns: Ann[]): number {
  for (let i = anns.length - 1; i >= 0; i--) {
    const ann = anns[i];
    if (ann.t === "marker") {
      const nearBadge = Math.hypot(pt.x - ann.pos.x, pt.y - ann.pos.y) <= BADGE_R + 6;
      const notePos = calloutTextPos(ann.pos, ann.label);
      const nearNote = Boolean(ann.note?.trim()) && inRect(pt, { x: notePos.x, y: notePos.y, w: Math.max(80, ann.note!.length * 10 + 20), h: 28 });
      if (nearBadge || nearNote) return i;
    }
    if (ann.t === "boxCallout") {
      const n = norm(ann.rect);
      const nearLabel = Math.hypot(pt.x - ann.labelPos.x, pt.y - ann.labelPos.y) <= BADGE_R + 6;
      const notePos = calloutTextPos(ann.labelPos, ann.label);
      const nearNote = Boolean(ann.note?.trim()) && inRect(pt, { x: notePos.x, y: notePos.y, w: Math.max(80, ann.note!.length * 10 + 20), h: 28 });
      const nearRect =
        pt.x >= n.x - 8 && pt.x <= n.x + n.w + 8 &&
        pt.y >= n.y - 8 && pt.y <= n.y + n.h + 8 &&
        (Math.abs(pt.x - n.x) <= 8 || Math.abs(pt.x - (n.x + n.w)) <= 8 ||
         Math.abs(pt.y - n.y) <= 8 || Math.abs(pt.y - (n.y + n.h)) <= 8 || inRect(pt, n));
      if (nearLabel || nearNote || nearRect) return i;
    }
  }
  return -1;
}

function moveAnnotation(ann: Ann, dx: number, dy: number): Ann {
  switch (ann.t) {
    case "marker":
      return { ...ann, pos: { x: ann.pos.x + dx, y: ann.pos.y + dy } };
    case "boxCallout":
      return {
        ...ann,
        rect: { x: ann.rect.x + dx, y: ann.rect.y + dy, w: ann.rect.w, h: ann.rect.h },
        labelPos: { x: ann.labelPos.x + dx, y: ann.labelPos.y + dy },
      };
    case "rect":
    case "ellipse":
    case "mosaic":
      return { ...ann, rect: { x: ann.rect.x + dx, y: ann.rect.y + dy, w: ann.rect.w, h: ann.rect.h } };
    case "arrow":
      return { ...ann, p1: { x: ann.p1.x + dx, y: ann.p1.y + dy }, p2: { x: ann.p2.x + dx, y: ann.p2.y + dy } };
    case "pencil":
      return { ...ann, pts: ann.pts.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    case "text":
      return { ...ann, pos: { x: ann.pos.x + dx, y: ann.pos.y + dy } };
  }
}

function renderAnnotationSelection(ctx: CanvasRenderingContext2D, ann: Ann) {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 3;
  if (ann.t === "marker") {
    ctx.beginPath();
    ctx.arc(ann.pos.x, ann.pos.y, BADGE_R + 7, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ann.t === "boxCallout" || ann.t === "rect" || ann.t === "ellipse" || ann.t === "mosaic") {
    const n = norm(ann.rect);
    ctx.strokeRect(n.x - 5, n.y - 5, n.w + 10, n.h + 10);
  }
  ctx.restore();
}

function renderAnnotation(ctx: CanvasRenderingContext2D, ann: Ann, bgImg?: HTMLImageElement, bgRect?: Rect | null) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  switch (ann.t) {
    case "marker": {
      drawCalloutBadge(ctx, ann.pos, ann.label, ann.color);
      drawCalloutNote(ctx, ann.pos, ann.label, ann.note);
      break;
    }
    case "boxCallout": {
      const { x, y, w, h } = norm(ann.rect);
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = ann.lw;
      ctx.shadowColor = "rgba(0,0,0,0.22)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      if ((ctx as any).roundRect) {
        ctx.beginPath();
        (ctx as any).roundRect(x, y, w, h, 6);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, w, h);
      }
      ctx.shadowColor = "transparent";
      ctx.globalAlpha = 0.08;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      drawArrow(ctx, ann.labelPos, boxCalloutTarget(ann.rect, ann.labelPos));
      drawCalloutBadge(ctx, ann.labelPos, ann.label, ann.color);
      drawCalloutNote(ctx, ann.labelPos, ann.label, ann.note);
      break;
    }
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
      const sourceScale = bgRect ? bgImg.width / bgRect.w : 1;
      const sx = bgRect ? (x - bgRect.x) * sourceScale : x;
      const sy = bgRect ? (y - bgRect.y) * sourceScale : y;
      oc.drawImage(bgImg, sx, sy, w * sourceScale, h * sourceScale, 0, 0, sw, sh);
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
  selectedAnnIndex: number | null = null,
  bgRect: Rect | null = null,
  editMode = false,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  ctx.clearRect(0, 0, W, H);

  if (bgImg) {
    if (bgRect) {
      ctx.drawImage(bgImg, bgRect.x, bgRect.y, bgRect.w, bgRect.h);
    } else {
      ctx.drawImage(bgImg, 0, 0, W, H);
    }
  }

  if (phase === "selecting" || phase === "annotating") {
    if (!editMode) {
      // Dark overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
      ctx.fillRect(0, 0, W, H);
    }

    if (sel) {
      const n = norm(sel);

      // Reveal selected area from background
      if (bgImg) {
        if (bgRect) {
          ctx.drawImage(
            bgImg,
            n.x - bgRect.x,
            n.y - bgRect.y,
            n.w,
            n.h,
            n.x,
            n.y,
            n.w,
            n.h,
          );
        } else {
          ctx.drawImage(bgImg, n.x, n.y, n.w, n.h, n.x, n.y, n.w, n.h);
        }
      }

      // Annotations on top of the revealed area
      for (const ann of anns) renderAnnotation(ctx, ann, bgImg ?? undefined, bgRect);
      if (curAnn) renderAnnotation(ctx, curAnn, bgImg ?? undefined, bgRect);
      if (selectedAnnIndex !== null && anns[selectedAnnIndex]) renderAnnotationSelection(ctx, anns[selectedAnnIndex]);

      if (!editMode) {
        // Selection border 鈥?two-tone for visibility on any bg
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
        const label = `${Math.round(n.w)} x ${Math.round(n.h)}`;
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
}

// 鈹€鈹€ ArrayBuffer 鈫?base64 (chunked, avoids stack overflow) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
  }
  return btoa(binary);
}

// 鈹€鈹€ Tool icon components (pure SVG) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
function IconMarker() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.18" />
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth={2} />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontFamily="sans-serif" fontWeight="bold" fill="currentColor">1</text>
    </svg>
  );
}
function IconMove() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBoxCallout() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="7" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth={2} />
      <line x1="16.5" y1="7.5" x2="13.5" y2="10" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <polyline points="14,7.5 16.5,7.5 16.5,10" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="6" r="4" fill="currentColor" />
      <text x="18" y="8.8" textAnchor="middle" fontSize="6.5" fontFamily="sans-serif" fontWeight="bold" fill="#111827">1</text>
    </svg>
  );
}
function IconOcr() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth={2} />
      <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M7 2H5a3 3 0 0 0-3 3v2M17 2h2a3 3 0 0 1 3 3v2M7 22H5a3 3 0 0 1-3-3v-2M17 22h2a3 3 0 0 0 3-3v-2" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
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
function IconIssueReport() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 14l2.4-2.4 2 2 2.8-3.1L17 14" strokeLinejoin="round" />
      <path d="M7 17h5M15 17h2" />
      <circle cx="17" cy="7" r="3" fill="currentColor" stroke="none" />
      <text x="17" y="9.2" textAnchor="middle" fontSize="5.5" fontFamily="sans-serif" fontWeight="bold" fill="#111827">1</text>
    </svg>
  );
}
// 鈹€鈹€ Toolbar 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const TOOLS: { key: Tool; icon: () => ReactElement; title: string }[] = [
  { key: "move",       icon: IconMove,       title: "拖拽编辑痕迹 (V)" },
  { key: "marker",     icon: IconMarker,     title: "标注+说明 (N，可留空)" },
  { key: "boxCallout", icon: IconBoxCallout, title: "方框拖拽标注 (B)" },
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
  onOcr: () => void;
  onSave: () => void;
  onPin: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  ocrBusy: boolean;
  style: CSSProperties;
}

function Toolbar({
  activeTool, activeColor, activeLw,
  onTool, onColor, onLw,
  onUndo, onCopy, onOcr, onSave, onPin,
  onCancel, onConfirm,
  ocrBusy,
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
        maxWidth: "calc(100vw - 24px)",
        overflowX: "auto",
        overflowY: "hidden",
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
        <span key={key} style={{ display: "contents" }}>
          <button
            title={title}
            onClick={() => onTool(activeTool === key ? null : key)}
            style={{ ...baseBtn, ...(activeTool === key ? activeToolBtn : {}) }}
          >
            <Icon />
          </button>
          {key === "boxCallout" && (
            <button
              title={ocrBusy ? "正在识别截图文字" : "识别截图文字"}
              onClick={onOcr}
              disabled={ocrBusy}
              style={{
                ...baseBtn,
                opacity: ocrBusy ? 0.55 : 1,
                cursor: ocrBusy ? "default" : "pointer",
              }}
            >
              <IconOcr />
            </button>
          )}
        </span>
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
      <button title="存入截图问题报告" onClick={onPin} style={baseBtn}>
        <IconIssueReport />
      </button>

      <div style={sep} />

      {/* Cancel 鈥?red Mac button */}
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
        x
      </button>

      {/* Confirm 鈥?green Mac button */}
      <button
        title="完成保存 (Enter)"
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

// 鈹€鈹€ Main component 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export function ScreenshotApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImgRef  = useRef<HTMLImageElement | null>(null);
  const bgRectRef = useRef<Rect | null>(null);
  const editScaleRef = useRef(1);
  const editingScreenshotIdRef = useRef<string | null>(null);

  // 鈹€鈹€ React state (drives JSX) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const [phase,       setPhaseState]  = useState<Phase>("init");
  const [selection,   setSelState]    = useState<Rect | null>(null);
  const [activeTool,  setToolState]   = useState<Tool | null>(null);
  const [activeColor, setColorState]  = useState("#ff3b30");
  const [activeLw,    setLwState]     = useState(2);
  const [textInput,   setTextInput]   = useState<TextInputState | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);
  const [cursorPos,   setCursorPos]   = useState<Pt | null>(null);
  const [selectedAnnIndex, setSelectedAnnIndexState] = useState<number | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [, setAnnEditVersion] = useState(0);

  // 鈹€鈹€ Refs (fast access in canvas callbacks without stale closures) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const phaseRef  = useRef<Phase>("init");
  const selRef    = useRef<Rect | null>(null);
  const annsRef   = useRef<Ann[]>([]);
  const undoRef   = useRef<Ann[][]>([]);
  const toolRef   = useRef<Tool | null>(null);
  const colorRef  = useRef("#ff3b30");
  const lwRef     = useRef(2);
  const curAnnRef = useRef<Ann | null>(null);
  const selectedAnnIndexRef = useRef<number | null>(null);
  const dragRef   = useRef<{
    mode: "sel-new" | "sel-move" | "sel-resize" | "ann" | "ann-move";
    startMouse: Pt;
    initSel?: Rect;
    initAnns?: Ann[];
    annIndex?: number;
    handleIdx?: number;
  } | null>(null);

  // Synced setters
  const setPhase = (p: Phase)           => { phaseRef.current = p;  setPhaseState(p); };
  const setSel   = (r: Rect | null)     => { selRef.current = r;    setSelState(r); };
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1500);
  };
  const setTool  = (t: Tool | null)     => {
    toolRef.current = t;
    setToolState(t);
    if (t) setSelectedAnnIndex(null);
  };
  const setSelectedAnnIndex = (idx: number | null) => { selectedAnnIndexRef.current = idx; setSelectedAnnIndexState(idx); };
  const setColor = (c: string)          => {
    colorRef.current = c;
    setColorState(c);
    const idx = selectedAnnIndexRef.current;
    if (idx !== null && annsRef.current[idx] && "color" in annsRef.current[idx]) {
      undoRef.current.push([...annsRef.current]);
      annsRef.current = annsRef.current.map((ann, i) => i === idx && "color" in ann ? { ...ann, color: c } : ann);
      doRender();
    }
  };
  const setLw    = (lw: number)         => {
    lwRef.current = lw;
    setLwState(lw);
    const idx = selectedAnnIndexRef.current;
    if (idx !== null && annsRef.current[idx] && "lw" in annsRef.current[idx]) {
      undoRef.current.push([...annsRef.current]);
      annsRef.current = annsRef.current.map((ann, i) => i === idx && "lw" in ann ? { ...ann, lw } : ann);
      doRender();
    }
  };
  const updateSelectedAnnNote = (value: string) => {
    const idx = selectedAnnIndexRef.current;
    if (idx === null) return;
    const ann = annsRef.current[idx];
    if (!ann || (ann.t !== "marker" && ann.t !== "boxCallout")) return;
    annsRef.current = annsRef.current.map((item, i) => (
      i === idx && (item.t === "marker" || item.t === "boxCallout")
        ? { ...item, note: value }
        : item
    ));
    setAnnEditVersion((version) => version + 1);
    doRender();
  };

  // 鈹€鈹€ Canvas render 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const doRender = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderFrame(
      canvas,
      bgImgRef.current,
      phaseRef.current,
      selRef.current,
      annsRef.current,
      curAnnRef.current,
      selectedAnnIndexRef.current,
      bgRectRef.current,
      Boolean(editingScreenshotIdRef.current),
    );
  }, []);

  // 鈹€鈹€ Resize canvas to current window dimensions and restore DPR scale 鈹€鈹€鈹€鈹€鈹€鈹€
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
    // Setting canvas.width resets the context 鈥?must re-apply scale
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  const toEditorAnnotations = (annotations: StoredScreenshotAnnotation[] | undefined, width: number, height: number, origin: Pt = { x: 0, y: 0 }, scale = 1): Ann[] => {
    if (!annotations?.length) return [];
    return annotations.map((annotation) => {
      const color = annotation.color ?? "#ff3b30";
      const label = annotation.id;
      const note = annotation.label;
      const pos = { x: origin.x + annotation.x * width * scale, y: origin.y + annotation.y * height * scale };
      if (annotation.kind === "boxCallout") {
        return {
          t: "boxCallout",
          rect: { x: Math.max(0, pos.x - 70), y: Math.max(0, pos.y - 44), w: 140, h: 88 },
          label,
          labelPos: pos,
          color,
          lw: 2,
          note,
        };
      }
      return { t: "marker", pos, label, color, note };
    });
  };

  // 鈹€鈹€ Load a base64 PNG as the background and enter selecting phase 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const loadScreenshotData = useCallback((
    data: string,
    options?: {
      fullImageSelection?: boolean;
      editId?: string;
      width?: number;
      height?: number;
      annotations?: StoredScreenshotAnnotation[];
    },
  ) => {
    // Reset all editing state before loading new screenshot
    editingScreenshotIdRef.current = options?.editId ?? null;
    selRef.current      = null;
    annsRef.current     = [];
    curAnnRef.current   = null;
    undoRef.current     = [];
    dragRef.current     = null;
    selectedAnnIndexRef.current = null;
    bgImgRef.current    = null;
    bgRectRef.current   = null;
    editScaleRef.current = 1;
    setSelState(null);
    setSelectedAnnIndexState(null);
    setTextInput(null);
    setToolState(null);
    toolRef.current = null;
    phaseRef.current = "init";
    setPhaseState("init");

    resizeCanvas();

    const img = new Image();
    img.onload = () => {
      bgImgRef.current = img;
      if (options?.fullImageSelection) {
        const w = options.width ?? img.width;
        const h = options.height ?? img.height;
        const toolbarReserve = 96;
        const maxW = Math.max(1, window.innerWidth - 48);
        const maxH = Math.max(1, window.innerHeight - toolbarReserve - 48);
        const displayScale = Math.max(1, Math.min(maxW / w, maxH / h));
        const displayW = Math.round(w * displayScale);
        const displayH = Math.round(h * displayScale);
        const x = Math.max(24, Math.round((window.innerWidth - displayW) / 2));
        const y = Math.max(18, Math.round((window.innerHeight - toolbarReserve - displayH) / 2));
        editScaleRef.current = displayScale;
        bgRectRef.current = { x, y, w: displayW, h: displayH };
        selRef.current = { x, y, w: displayW, h: displayH };
        annsRef.current = toEditorAnnotations(options.annotations, w, h, { x, y }, displayScale);
        setSelState(selRef.current);
        phaseRef.current = "annotating";
        setPhaseState("annotating");
      } else {
        phaseRef.current = "selecting";
        setPhaseState("selecting");
      }
      renderFrame(
        canvasRef.current!,
        bgImgRef.current,
        phaseRef.current,
        selRef.current,
        annsRef.current,
        curAnnRef.current,
        selectedAnnIndexRef.current,
        bgRectRef.current,
        Boolean(editingScreenshotIdRef.current),
      );
    };
    img.src = "data:image/png;base64," + data;
  }, [resizeCanvas]);

  const loadPendingEdit = useCallback(() => {
    const pending = takePendingScreenshotEdit();
    if (!pending) return;
    loadScreenshotData(pending.data, {
      fullImageSelection: true,
      editId: pending.id,
      width: pending.width,
      height: pending.height,
      annotations: pending.annotations,
    });
  }, [loadScreenshotData]);

  // 鈹€鈹€ Init: size canvas, set up keyboard + screenshot-ready listener 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  useEffect(() => {
    resizeCanvas();
    loadPendingEdit();

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;
      if (e.key === "Escape")                                        handleEscape();
      if (e.key === "Enter" && phaseRef.current === "annotating")   void handleConfirm();
      if ((e.metaKey || e.ctrlKey) && e.key === "z")                handleUndo();
      if (e.key === "v" || e.key === "V")  setTool("move");
      if (e.key === "n" || e.key === "N")  setTool("marker");
      if (e.key === "b" || e.key === "B")  setTool("boxCallout");
      if (e.key === "r" || e.key === "R")  setTool("rect");
      if (e.key === "e" || e.key === "E")  setTool("ellipse");
      if (e.key === "a" || e.key === "A")  setTool("arrow");
      if (e.key === "p" || e.key === "P")  setTool("pencil");
      if (e.key === "t" || e.key === "T")  setTool("text");
      if (e.key === "m" || e.key === "M")  setTool("mosaic");
    };
    window.addEventListener("keydown", onKey);

    // Rust emits this event every time a new screenshot is ready.
    // Payload IS the base64 JPEG string 鈥?no second IPC call needed.
    const unlistenPromise = listen<string>("screenshot-ready", (event) => {
      if (event.payload) loadScreenshotData(event.payload);
    });
    window.addEventListener("storage", loadPendingEdit);
    window.addEventListener("devlauncher-pending-screenshot-edit", loadPendingEdit);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("storage", loadPendingEdit);
      window.removeEventListener("devlauncher-pending-screenshot-edit", loadPendingEdit);
      unlistenPromise.then(fn => fn());
    };
  }, [resizeCanvas, loadScreenshotData, loadPendingEdit]);

  // 鈹€鈹€ Mouse position helper 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const getPos = (e: RMouseEvent<HTMLCanvasElement>): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // 鈹€鈹€ Mouse Down 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const onMouseDown = (e: RMouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || textInput) return;
    const pos  = getPos(e);
    setCursorPos(pos);
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
        const annIdx = hitAnnotation(pos, annsRef.current);
        if (annIdx >= 0) {
          setSelectedAnnIndex(annIdx);
          dragRef.current = { mode: "ann-move", startMouse: pos, initAnns: annsRef.current.map(ann => ({ ...ann })), annIndex: annIdx };
          return;
        }
        setSelectedAnnIndex(null);
        if (editingScreenshotIdRef.current) return;
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

      if (tool === "move") {
        const annIdx = hitAnnotation(pos, annsRef.current);
        if (annIdx >= 0) {
          setSelectedAnnIndex(annIdx);
          dragRef.current = { mode: "ann-move", startMouse: pos, initAnns: annsRef.current.map(ann => ({ ...ann })), annIndex: annIdx };
        } else {
          setSelectedAnnIndex(null);
        }
        return;
      }

      if (tool === "text") {
        setSelectedAnnIndex(null);
        setTextInput({ pos, val: "" });
        return;
      }
      if (tool === "marker") {
        setSelectedAnnIndex(null);
        undoRef.current.push([...annsRef.current]);
        const label = nextCalloutLabel(annsRef.current);
        const annIndex = annsRef.current.length;
        annsRef.current = [
          ...annsRef.current,
          { t: "marker", pos, label, color: colorRef.current },
        ];
        setSelectedAnnIndex(annIndex);
        doRender();
        return;
      }

      const color = colorRef.current;
      const lw    = lwRef.current;
      let initAnn: Ann | undefined;
      if (tool === "boxCallout") {
        const rect = { x: pos.x, y: pos.y, w: 0, h: 0 };
        initAnn = { t: "boxCallout", rect, label: nextCalloutLabel(annsRef.current), labelPos: calloutLabelPos(rect, selRef.current), color, lw };
      }
      if (tool === "rect")    initAnn = { t: "rect",    rect: { x: pos.x, y: pos.y, w: 0, h: 0 }, color, lw };
      if (tool === "ellipse") initAnn = { t: "ellipse", rect: { x: pos.x, y: pos.y, w: 0, h: 0 }, color, lw };
      if (tool === "arrow")   initAnn = { t: "arrow",   p1: pos, p2: pos, color, lw };
      if (tool === "pencil")  initAnn = { t: "pencil",  pts: [pos], color, lw };
      if (tool === "mosaic")  initAnn = { t: "mosaic",  rect: { x: pos.x, y: pos.y, w: 0, h: 0 } };

      if (initAnn) {
        setSelectedAnnIndex(null);
        curAnnRef.current = initAnn;
        dragRef.current = { mode: "ann", startMouse: pos };
      }
    }
  };

  // 鈹€鈹€ Mouse Move 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const onMouseMove = (e: RMouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    setCursorPos(pos);
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
    } else if (dr.mode === "ann-move") {
      const dx = pos.x - dr.startMouse.x;
      const dy = pos.y - dr.startMouse.y;
      const idx = dr.annIndex!;
      const initAnns = dr.initAnns!;
      annsRef.current = initAnns.map((ann, i) => i === idx ? moveAnnotation(ann, dx, dy) : ann);
    } else if (dr.mode === "ann" && curAnnRef.current) {
      const ann = curAnnRef.current;
      if (ann.t === "rect" || ann.t === "ellipse" || ann.t === "mosaic" || ann.t === "boxCallout") {
        (ann as Ann & { rect: Rect }).rect = {
          x: dr.startMouse.x, y: dr.startMouse.y,
          w: pos.x - dr.startMouse.x, h: pos.y - dr.startMouse.y,
        };
        if (ann.t === "boxCallout") ann.labelPos = calloutLabelPos(ann.rect, selRef.current);
      } else if (ann.t === "arrow") {
        ann.p2 = pos;
      } else if (ann.t === "pencil") {
        ann.pts.push(pos);
      }
    }
    doRender();
  };

  // 鈹€鈹€ Mouse Up 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

    } else if (dr.mode === "ann-move") {
      const moved = Math.hypot((_e.clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0)) - dr.startMouse.x, (_e.clientY - (canvasRef.current?.getBoundingClientRect().top ?? 0)) - dr.startMouse.y);
      const ann = annsRef.current[dr.annIndex!];
      if (moved < 3 && ann && (ann.t === "marker" || ann.t === "boxCallout")) {
        setSelectedAnnIndex(dr.annIndex!);
      } else {
        undoRef.current.push(dr.initAnns!);
      }
      doRender();

    } else if (dr.mode === "ann") {
      const ann = curAnnRef.current;
      curAnnRef.current = null;
      if (ann) {
        let valid = true;
        if ((ann.t === "rect" || ann.t === "ellipse" || ann.t === "mosaic" || ann.t === "boxCallout") &&
            (Math.abs(ann.rect.w) < 3 || Math.abs(ann.rect.h) < 3)) valid = false;
        if (ann.t === "arrow" && Math.hypot(ann.p2.x - ann.p1.x, ann.p2.y - ann.p1.y) < 5) valid = false;
        if (ann.t === "pencil" && ann.pts.length < 2) valid = false;

        if (valid) {
          undoRef.current.push([...annsRef.current]);
          const annIndex = annsRef.current.length;
          annsRef.current = [...annsRef.current, ann];
          if (ann.t === "boxCallout") {
            setSelectedAnnIndex(annIndex);
          }
        }
      }
      doRender();
    }
  };

  // 鈹€鈹€ Actions 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const handleUndo = () => {
    if (undoRef.current.length > 0) {
      annsRef.current = undoRef.current.pop()!;
      if (selectedAnnIndexRef.current !== null && !annsRef.current[selectedAnnIndexRef.current]) setSelectedAnnIndex(null);
      doRender();
    }
  };

  /** Build result canvas: selected area + annotations composited */
  const buildResult = (): HTMLCanvasElement | null => {
    const sel  = selRef.current ? norm(selRef.current) : null;
    const bgImg = bgImgRef.current;
    if (!sel || !bgImg) return null;
    const bgRect = bgRectRef.current;
    const editScale = editingScreenshotIdRef.current ? editScaleRef.current : 1;
    const out = document.createElement("canvas");
    out.width  = Math.max(1, Math.round(sel.w / editScale));
    out.height = Math.max(1, Math.round(sel.h / editScale));
    const ctx = out.getContext("2d")!;
    if (bgRect) {
      ctx.drawImage(bgImg, (sel.x - bgRect.x) / editScale, (sel.y - bgRect.y) / editScale, sel.w / editScale, sel.h / editScale, 0, 0, out.width, out.height);
    } else {
      ctx.drawImage(bgImg, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
    }
    if (editScale !== 1) ctx.scale(1 / editScale, 1 / editScale);
    ctx.translate(-sel.x, -sel.y);
    for (const ann of annsRef.current) renderAnnotation(ctx, ann, bgImg, bgRect);
    return out;
  };

  /** Build selected area without annotations for AI module overlay editing */
  const buildBaseResult = (): HTMLCanvasElement | null => {
    const sel  = selRef.current ? norm(selRef.current) : null;
    const bgImg = bgImgRef.current;
    if (!sel || !bgImg) return null;
    const bgRect = bgRectRef.current;
    const editScale = editingScreenshotIdRef.current ? editScaleRef.current : 1;
    const out = document.createElement("canvas");
    out.width  = Math.max(1, Math.round(sel.w / editScale));
    out.height = Math.max(1, Math.round(sel.h / editScale));
    const ctx = out.getContext("2d")!;
    if (bgRect) {
      ctx.drawImage(bgImg, (sel.x - bgRect.x) / editScale, (sel.y - bgRect.y) / editScale, sel.w / editScale, sel.h / editScale, 0, 0, out.width, out.height);
    } else {
      ctx.drawImage(bgImg, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
    }
    return out;
  };

  const buildStoredAnnotations = (): StoredScreenshotAnnotation[] => {
    const sel = selRef.current ? norm(selRef.current) : null;
    if (!sel) return [];
    const editScale = editingScreenshotIdRef.current ? editScaleRef.current : 1;
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    return annsRef.current.flatMap((ann): StoredScreenshotAnnotation[] => {
      if (ann.t === "marker") {
        return [{
          id: ann.label,
          label: ann.note?.trim() ?? "",
          tone: toneFromColor(ann.color),
          x: clamp01(((ann.pos.x - sel.x) / editScale) / (sel.w / editScale)),
          y: clamp01(((ann.pos.y - sel.y) / editScale) / (sel.h / editScale)),
          kind: "marker",
          color: ann.color,
          burnedIn: false,
        }];
      }
      if (ann.t === "boxCallout") {
        return [{
          id: ann.label,
          label: ann.note?.trim() ?? "",
          tone: toneFromColor(ann.color),
          x: clamp01(((ann.labelPos.x - sel.x) / editScale) / (sel.w / editScale)),
          y: clamp01(((ann.labelPos.y - sel.y) / editScale) / (sel.h / editScale)),
          kind: "boxCallout",
          color: ann.color,
          burnedIn: false,
        }];
      }
      return [];
    }).sort((a, b) => a.id - b.id);
  };

  const saveToScreenshotAiLibrary = async (out: HTMLCanvasElement): Promise<boolean> => {
    return await new Promise<boolean>(resolve => {
      out.toBlob(blob => {
        if (!blob) { resolve(false); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          const annotations = buildStoredAnnotations();
          if (editingScreenshotIdRef.current) {
            updateScreenshot(editingScreenshotIdRef.current, {
              data: base64,
              width: out.width,
              height: out.height,
              annotations,
            });
          } else {
            addScreenshot({
              data: base64,
              width: out.width,
              height: out.height,
              annotations,
            });
          }
          resolve(true);
        };
        reader.onerror = () => resolve(false);
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.92);
    });
  };

  const openScreenshotIssueReport = async () => {
    try {
      await invoke("show_screenshotai_window");
    } catch (err) {
      console.error("open screenshot issue report failed", err);
    }
  };

  const handleCopy = async (): Promise<boolean> => {
    const out = buildResult();
    if (!out) {
      showToast("没有可复制内容");
      return false;
    }
    let ok = false;
    await new Promise<void>(resolve => {
      out.toBlob(async blob => {
        if (!blob) { resolve(); return; }
        try {
          const base64 = toBase64(await blob.arrayBuffer());
          await invoke("set_clipboard_image", { data: base64 });
          ok = true;
        } catch (err) {
          console.error("copy failed", err);
        }
        resolve();
      }, "image/png");
    });
    showToast(ok ? "已复制，可继续编辑" : "复制失败");
    return ok;
  };

  const handleOcr = async () => {
    if (ocrBusy) return;
    commitTextInput();
    const out = buildBaseResult();
    if (!out) {
      showToast("没有可识别截图");
      return;
    }

    setOcrBusy(true);
    showToast("正在识别截图文字...");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        out.toBlob(blob => {
          if (!blob) {
            reject(new Error("截图图片生成失败"));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("截图图片读取失败"));
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.92);
      });
      const text = (await invoke<string>("ocr_recognize_image", { data: base64 })).trim();
      if (!text) {
        showToast("未识别到文字");
        return;
      }
      await invoke("set_clipboard_text", { text });
      showToast("已识别并复制文字");
    } catch (err) {
      console.error("ocr failed", err);
      showToast(`OCR 失败：${String(err)}`);
    } finally {
      setOcrBusy(false);
    }
  };

  const commitTextInput = (input = textInput) => {
    if (!input) return;
    const trimmed = input.val.trim();
    if (input.target?.kind === "ann-note") {
      const idx = input.target.annIndex;
      if (annsRef.current[idx] && (annsRef.current[idx].t === "marker" || annsRef.current[idx].t === "boxCallout")) {
        undoRef.current.push([...annsRef.current]);
        annsRef.current = annsRef.current.map((ann, i) => {
          if (i !== idx || (ann.t !== "marker" && ann.t !== "boxCallout")) return ann;
          return { ...ann, note: trimmed };
        });
        setSelectedAnnIndex(idx);
        doRender();
      }
      setTextInput(null);
      return;
    }
    if (trimmed) {
      undoRef.current.push([...annsRef.current]);
      const ann: Ann = {
        t: "text",
        pos: input.pos,
        text: trimmed,
        color: colorRef.current,
        fs: 18,
      };
      annsRef.current = [...annsRef.current, ann];
      doRender();
    }
    setTextInput(null);
  };

  const handleSave = async () => {
    commitTextInput();
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
        showToast("已保存，可继续编辑");
        handleCancel();
      } catch (err) {
        console.error("save failed", err);
        showToast("保存失败");
      }
    }, "image/png");
  };

  /** Save to screenshot library (for screenshotai plugin) and close */
  const handlePin = async () => {
    commitTextInput();
    const out = buildBaseResult();
    if (!out) return;
    const saved = await saveToScreenshotAiLibrary(out);
    if (!saved) {
      showToast("存入失败");
      return;
    }
    await openScreenshotIssueReport();
    handleCancel();
    return;
  };

  const handleConfirm = async () => {
    commitTextInput();
    const out = buildBaseResult();
    if (!out) return;
    await handleCopy();
    const saved = await saveToScreenshotAiLibrary(out);
    if (saved) {
      await openScreenshotIssueReport();
      handleCancel();
    } else {
      showToast("保存失败");
    }
  };

  const handleCancel = () => {
    editingScreenshotIdRef.current = null;
    selRef.current   = null;
    bgRectRef.current = null;
    editScaleRef.current = 1;
    annsRef.current  = [];
    curAnnRef.current = null;
    undoRef.current  = [];
    dragRef.current  = null;
    selectedAnnIndexRef.current = null;
    setPhase("init");
    setSel(null);
    setSelectedAnnIndexState(null);
    setTextInput(null);
    doRender();
    getCurrentWindow().hide();
  };

  const handleTextConfirm = () => {
    commitTextInput();
  };

  const handleEscape = () => {
    if (textInput) {
      setTextInput(null);
      return;
    }
    if (selectedAnnIndexRef.current !== null) {
      setSelectedAnnIndex(null);
      return;
    }
    if (curAnnRef.current || dragRef.current?.mode === "ann") {
      curAnnRef.current = null;
      dragRef.current = null;
      doRender();
      return;
    }
    if (undoRef.current.length > 0) {
      handleUndo();
      return;
    }
    if (toolRef.current) {
      setTool(null);
      return;
    }
    if (phaseRef.current === "selecting" && selRef.current) {
      setSel(null);
      doRender();
    }
  };

  const getCursor = () => {
    if (phase === "init")       return "default";
    if (phase === "selecting")  return "none";
    if (activeTool === "move")  return "none";
    if (activeTool === "text")  return "text";
    if (activeTool)             return "none";
    return "default";
  };

  const showCustomCursor =
    Boolean(cursorPos) &&
    !textInput &&
    (phase === "selecting" || (phase === "annotating" && activeTool !== null && activeTool !== "text"));

  // Toolbar position (below or above selection)
  const getToolbarStyle = (): CSSProperties | null => {
    if (!selection) return null;
    const n    = norm(selection);
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const TB_H = 52;
    const GAP  = 12;
    const TB_W = Math.min(820, winW - GAP * 2);

    let top: number;
    if (n.y + n.h + TB_H + GAP < winH)       top = n.y + n.h + GAP;
    else if (n.y - TB_H - GAP > 0)            top = n.y - TB_H - GAP;
    else                                       top = Math.max(GAP, n.y + n.h - TB_H - 4);

    const left = Math.max(GAP, Math.min(winW - TB_W - GAP, n.x + n.w / 2 - TB_W / 2));
    return { top, left };
  };

  const tbStyle = getToolbarStyle();
  const selectedAnn = selectedAnnIndex !== null ? annsRef.current[selectedAnnIndex] : null;
  const selectedCalloutAnn = selectedAnn && (selectedAnn.t === "marker" || selectedAnn.t === "boxCallout") ? selectedAnn : null;
  const selectedCalloutPos = selectedCalloutAnn
    ? calloutTextPos(selectedCalloutAnn.t === "marker" ? selectedCalloutAnn.pos : selectedCalloutAnn.labelPos, selectedCalloutAnn.label)
    : null;

  // 鈹€鈹€ JSX 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  return (
    <div
      style={{ width: "100vw", height: "100vh", overflow: "hidden", userSelect: "none", background: "transparent" }}
      onContextMenu={(event) => {
        event.preventDefault();
        handleCancel();
      }}
    >
      {/* Full-screen canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: getCursor(), position: "absolute", top: 0, left: 0 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => setCursorPos(null)}
      />

      {showCustomCursor && cursorPos && (
        <div style={{
          position: "absolute",
          left: cursorPos.x,
          top: cursorPos.y,
          width: 34,
          height: 34,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 10002,
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.95)) drop-shadow(0 0 5px rgba(0,122,255,0.75))",
        }}>
          <div style={{
            position: "absolute",
            left: 16,
            top: 2,
            width: 2,
            height: 30,
            borderRadius: 1,
            background: "rgba(255,255,255,0.98)",
          }} />
          <div style={{
            position: "absolute",
            left: 2,
            top: 16,
            width: 30,
            height: 2,
            borderRadius: 1,
            background: "rgba(255,255,255,0.98)",
          }} />
          <div style={{
            position: "absolute",
            left: 11,
            top: 11,
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "2px solid #007aff",
            background: "rgba(0,0,0,0.34)",
            boxSizing: "border-box",
          }} />
        </div>
      )}

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
          onOcr={handleOcr}
          onSave={handleSave}
          onPin={handlePin}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
          ocrBusy={ocrBusy}
          style={tbStyle}
        />
      )}

      {toast && (
        <div style={{
          position: "absolute",
          left: "50%",
          bottom: 92,
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.92)",
          fontSize: 13,
          fontWeight: 600,
          background: "rgba(28,28,30,0.78)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          borderRadius: 12,
          padding: "8px 14px",
          pointerEvents: "none",
          zIndex: 10001,
        }}>
          {toast}
        </div>
      )}

      {selectedCalloutAnn && selectedCalloutPos && !textInput && (
        <input
          autoFocus
          value={selectedCalloutAnn.note ?? ""}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          onFocus={e => e.currentTarget.select()}
          onChange={e => updateSelectedAnnNote(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape") setSelectedAnnIndex(null);
            e.stopPropagation();
          }}
          placeholder="输入说明，可留空"
          style={{
            position: "absolute",
            left: selectedCalloutPos.x,
            top: selectedCalloutPos.y,
            width: 180,
            boxSizing: "border-box",
            background: "rgba(28,28,30,0.88)",
            border: "1px solid rgba(255,255,255,0.22)",
            color: "rgba(255,255,255,0.94)",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            outline: "none",
            padding: "6px 9px",
            borderRadius: 8,
            boxShadow: "0 10px 28px rgba(0,0,0,0.34)",
            zIndex: 10003,
          }}
        />
      )}

      {/* Floating text input */}
      {textInput && (
        <input
          autoFocus
          value={textInput.val}
          onFocus={e => {
            if (textInput.target) e.currentTarget.select();
          }}
          onChange={e => setTextInput({ ...textInput, val: e.target.value })}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); handleTextConfirm(); }
            if (e.key === "Escape") setTextInput(null);
            e.stopPropagation();
          }}
          onBlur={handleTextConfirm}
          placeholder={textInput.target ? "输入说明..." : "输入文字..."}
          style={{
            position: "absolute",
            left: textInput.pos.x,
            top: textInput.pos.y,
            background: textInput.target ? "rgba(28,28,30,0.82)" : "rgba(0,0,0,0.55)",
            border: textInput.target ? "1px solid rgba(255,255,255,0.18)" : "none",
            borderBottom: textInput.target ? "1px solid rgba(255,255,255,0.22)" : `2.5px solid ${activeColor}`,
            color: textInput.target ? "rgba(255,255,255,0.94)" : activeColor,
            fontSize: textInput.target ? 13 : 20,
            fontWeight: textInput.target ? 600 : "bold",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            outline: "none",
            minWidth: textInput.target ? 150 : 130,
            padding: textInput.target ? "6px 8px" : "3px 4px",
            borderRadius: textInput.target ? 8 : "4px 4px 0 0",
            boxShadow: textInput.target ? "0 8px 24px rgba(0,0,0,0.28)" : "none",
            zIndex: 10000,
          }}
        />
      )}
    </div>
  );
}
