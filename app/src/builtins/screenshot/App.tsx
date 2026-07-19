import { useEffect, useRef, useState, useCallback } from "react";
import type { CSSProperties, MouseEvent as RMouseEvent, ReactElement } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as dialogSave } from "@tauri-apps/plugin-dialog";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { CaptureIcon, CheckIcon, CloseIcon, CopyIcon, DownloadIcon, PinIcon, RetryIcon } from "@/icons/controlIcons";
import { addScreenshot, takePendingScreenshotEdit, updateScreenshot } from "../screenshotStore";
import {
  clampPointToRect,
  clampRectToBounds,
  constrainTextWidth,
  fitImageInViewport,
  normRect,
  placeFloatingPanel,
  placeTextInput,
} from "./geometry";
import type { Pt, Rect } from "./geometry";
import type { StoredScreenshotAnnotation } from "../screenshotStore";

// 鈹€鈹€ Types 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
type Phase = "init" | "selecting" | "annotating";
type Tool = "move" | "marker" | "boxCallout" | "rect" | "ellipse" | "arrow" | "pencil" | "text" | "mosaic";
type TextInputState = { pos: Pt; val: string; target?: { kind: "ann-note"; annIndex: number } };
type PickedColor = { hex: string; rgb: string; r: number; g: number; b: number };
type OcrLine = { id: number; text: string; rect: { x: number; y: number; width: number; height: number } };
type OcrLayout = { text: string; width: number; height: number; lines: OcrLine[] };
type OcrTextLayer = {
  layout: OcrLayout;
  selectionRect: Rect;
  selectedText?: string;
  translatedText?: string;
  translateError?: string;
  translateBusy?: boolean;
};
type TranslateResponse = {
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  targetText: string;
};

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
  "#ff3b30", "#ffcc00", "#34c759", "#007aff",
];
const HANDLE_R = 5;
const SEL_COLOR = "rgba(78, 186, 255, 0.9)";
const BADGE_R = 13;
const CALLOUT_GAP = 30;
const OCR_ACTION_BTN: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.82)",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  flexShrink: 0,
};

// 鈹€鈹€ Rect helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function norm(r: Rect): Rect {
  return normRect(r);
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
  return placeTextInput(
    { x: pos.x + r + 10, y: pos.y - 12 },
    { w: window.innerWidth, h: window.innerHeight },
    { width: 190, height: 44, margin: 8 },
  ).point;
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/(\s+)/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + word : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line.trimEnd());
      line = word.trimStart();
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines.length ? lines : [text];
}

function drawCalloutNote(ctx: CanvasRenderingContext2D, pos: Pt, label: number, note: string | undefined) {
  const text = note?.trim();
  if (!text) return;
  const p = calloutTextPos(pos, label);
  ctx.save();
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
  ctx.textBaseline = "middle";
  const padX = 8;
  const maxTextWidth = Math.max(72, Math.min(280, window.innerWidth - p.x - 16 - padX * 2));
  const lines = wrapCanvasText(ctx, text, maxTextWidth);
  const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
  const w = constrainTextWidth(textWidth + padX * 2, p.x, window.innerWidth, 8);
  const lineHeight = 18;
  const h = Math.max(24, lines.length * lineHeight + 6);
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
  lines.forEach((line, index) => {
    ctx.fillText(line, p.x + padX, p.y + 12 + index * lineHeight + 0.5);
  });
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
      const maxWidth = Math.max(80, window.innerWidth - ann.pos.x - 12);
      wrapCanvasText(ctx, ann.text, maxWidth).forEach((line, index) => {
        ctx.fillText(line, ann.pos.x, ann.pos.y + index * (ann.fs + 5));
      });
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

function imageDisplayScale(bgImg: HTMLImageElement, bgRect: Rect | null): { x: number; y: number } {
  if (!bgRect) return { x: 1, y: 1 };
  return {
    x: bgImg.width / Math.max(1, bgRect.w),
    y: bgImg.height / Math.max(1, bgRect.h),
  };
}

function displayRectToImageRect(rect: Rect, bgImg: HTMLImageElement, bgRect: Rect | null): Rect {
  const n = norm(rect);
  if (!bgRect) return n;
  const scale = imageDisplayScale(bgImg, bgRect);
  return {
    x: (n.x - bgRect.x) * scale.x,
    y: (n.y - bgRect.y) * scale.y,
    w: n.w * scale.x,
    h: n.h * scale.y,
  };
}

function displayPointToImagePoint(point: Pt, bgImg: HTMLImageElement, bgRect: Rect | null): Pt {
  if (!bgRect) return point;
  const scale = imageDisplayScale(bgImg, bgRect);
  return {
    x: (point.x - bgRect.x) * scale.x,
    y: (point.y - bgRect.y) * scale.y,
  };
}

function componentToHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0").toUpperCase();
}

function rgbaToPickedColor(r: number, g: number, b: number): PickedColor {
  return {
    r,
    g,
    b,
    hex: `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`,
    rgb: `rgb(${r}, ${g}, ${b})`,
  };
}

function samplePickedColor(
  sampler: HTMLCanvasElement,
  bgImg: HTMLImageElement | null,
  bgRect: Rect | null,
  point: Pt | null,
): PickedColor | null {
  if (!sampler || !bgImg || !point) return null;
  if (bgRect && !inRect(point, bgRect)) return null;
  const imagePoint = displayPointToImagePoint(point, bgImg, bgRect);
  const sx = Math.max(0, Math.min(bgImg.width - 1, Math.floor(imagePoint.x)));
  const sy = Math.max(0, Math.min(bgImg.height - 1, Math.floor(imagePoint.y)));
  sampler.width = 1;
  sampler.height = 1;
  const ctx = sampler.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.drawImage(bgImg, sx, sy, 1, 1, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return rgbaToPickedColor(r, g, b);
}

function drawCursorGuide(ctx: CanvasRenderingContext2D, pos: Pt, selection: Rect | null, width: number, height: number, pickedColor: PickedColor | null) {
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.shadowColor = "rgba(0,0,0,0.68)";
  ctx.shadowBlur = 2;
  ctx.beginPath();
  ctx.moveTo(0, pos.y + 0.5);
  ctx.lineTo(width, pos.y + 0.5);
  ctx.moveTo(pos.x + 0.5, 0);
  ctx.lineTo(pos.x + 0.5, height);
  ctx.stroke();
  ctx.setLineDash([]);

  const n = selection ? norm(selection) : null;
  const label = n ? `${Math.round(n.w)} x ${Math.round(n.h)}  ${Math.round(pos.x)},${Math.round(pos.y)}` : `${Math.round(pos.x)},${Math.round(pos.y)}`;
  const colorLabel = pickedColor ? `  ${pickedColor.hex}` : "";
  const fullLabel = `${label}${colorLabel}`;
  ctx.font = "700 12px -apple-system, BlinkMacSystemFont, 'SF Pro Text', monospace";
  const badgeW = Math.min(290, Math.max(82, ctx.measureText(fullLabel).width + (pickedColor ? 34 : 16)));
  const badgeH = 24;
  const p = placeTextInput({ x: pos.x + 14, y: pos.y + 14 }, { w: width, h: height }, { width: badgeW, height: badgeH, margin: 8 }).point;
  ctx.shadowColor = "rgba(0,0,0,0.32)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "rgba(18,18,22,0.84)";
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(p.x, p.y, badgeW, badgeH, 7);
  } else {
    ctx.rect(p.x, p.y, badgeW, badgeH);
  }
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(78,186,255,0.54)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textBaseline = "middle";
  if (pickedColor) {
    ctx.fillStyle = pickedColor.hex;
    ctx.beginPath();
    ctx.arc(p.x + 13, p.y + badgeH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(fullLabel, p.x + 24, p.y + badgeH / 2 + 0.5);
  } else {
    ctx.fillText(fullLabel, p.x + 8, p.y + badgeH / 2 + 0.5);
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
  cursor: Pt | null = null,
  pickedColor: PickedColor | null = null,
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
          const source = displayRectToImageRect(n, bgImg, bgRect);
          ctx.drawImage(
            bgImg,
            source.x,
            source.y,
            source.w,
            source.h,
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

  if (!editMode && cursor && (phase === "selecting" || phase === "annotating")) {
    drawCursorGuide(ctx, cursor, sel, W, H, pickedColor);
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
  onTool: (t: Tool | null) => void;
  onColor: (c: string) => void;
  onUndo: () => void;
  onSelectFullScreen: () => void;
  onPinScreenshot: () => void;
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
  activeTool, activeColor,
  onTool, onColor,
  onUndo, onSelectFullScreen, onPinScreenshot, onCopy, onOcr, onSave, onPin,
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
      className="motion-scroll-area"
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "nowrap",
        gap: 2,
        padding: "7px 12px",
        maxWidth: "calc(100vw - 16px)",
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
              <CaptureIcon size={20} />
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

      {/* Actions */}
      <button title="选择全屏 (F)" onClick={onSelectFullScreen} style={{ ...baseBtn, fontWeight: 800, fontSize: 13 }}>
        F
      </button>
      <button title="撤销 (Ctrl+Z)" onClick={onUndo} style={baseBtn}>
        <RetryIcon size={18} />
      </button>
      <button title="保存图片" onClick={onSave} style={baseBtn}>
        <DownloadIcon size={18} />
      </button>
      <button title="钉住到屏幕" onClick={onPinScreenshot} style={baseBtn}>
        <PinIcon size={20} decorative />
      </button>
      <button title="复制到剪贴板" onClick={onCopy} style={baseBtn}>
        <CopyIcon size={18} />
      </button>
      <button title="存入截图问题报告" onClick={onPin} style={baseBtn}>
        <BuiltinIcon feature="screenshotai" size={18} />
      </button>

      <div style={sep} />

      <button
        title="取消 (Esc)"
        onClick={onCancel}
        style={baseBtn}
      >
        <CloseIcon size={18} />
      </button>

      <button
        title="完成并复制 (Enter)"
        onClick={onConfirm}
        style={baseBtn}
      >
        <CheckIcon size={18} />
      </button>
    </div>
  );
}

// 鈹€鈹€ Main component 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export function ScreenshotApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorSamplerRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef  = useRef<HTMLImageElement | null>(null);
  const bgRectRef = useRef<Rect | null>(null);
  const editScaleRef = useRef(1);
  const editingScreenshotIdRef = useRef<string | null>(null);

  // 鈹€鈹€ React state (drives JSX) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const [phase,       setPhaseState]  = useState<Phase>("init");
  const [selection,   setSelState]    = useState<Rect | null>(null);
  const [activeTool,  setToolState]   = useState<Tool | null>(null);
  const [activeColor, setColorState]  = useState("#ff3b30");
  const [textInput,   setTextInput]   = useState<TextInputState | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [cursorPos,   setCursorPos]   = useState<Pt | null>(null);
  const [selectedAnnIndex, setSelectedAnnIndexState] = useState<number | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrTextLayer, setOcrTextLayer] = useState<OcrTextLayer | null>(null);
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
  const cursorPosRef = useRef<Pt | null>(null);
  const pickedColorRef = useRef<PickedColor | null>(null);
  const selectedAnnIndexRef = useRef<number | null>(null);
  const ocrSelectableLayerRef = useRef<HTMLDivElement | null>(null);
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
  const setCursor = (pos: Pt | null) => {
    cursorPosRef.current = pos;
    if (!colorSamplerRef.current) colorSamplerRef.current = document.createElement("canvas");
    pickedColorRef.current = samplePickedColor(colorSamplerRef.current, bgImgRef.current, bgRectRef.current, pos);
    setCursorPos(pos);
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
      cursorPosRef.current,
      pickedColorRef.current,
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

  const syncCaptureViewport = useCallback(() => {
    resizeCanvas();
    if (
      bgImgRef.current &&
      !editingScreenshotIdRef.current &&
      phaseRef.current === "selecting"
    ) {
      bgRectRef.current = {
        x: 0,
        y: 0,
        w: window.innerWidth,
        h: window.innerHeight,
      };
    }
    doRender();
  }, [doRender, resizeCanvas]);

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
    pickedColorRef.current = null;
    editScaleRef.current = 1;
    setSelState(null);
    setSelectedAnnIndexState(null);
    setTextInput(null);
    setCaptureError(null);
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
        const fitted = fitImageInViewport(
          { w, h },
          { w: window.innerWidth, h: window.innerHeight },
          { margin: 24, toolbarReserve: 96 },
        );
        const displayScale = fitted.w / Math.max(1, w);
        editScaleRef.current = displayScale;
        bgRectRef.current = fitted;
        selRef.current = fitted;
        annsRef.current = toEditorAnnotations(options.annotations, w, h, { x: fitted.x, y: fitted.y }, displayScale);
        setSelState(selRef.current);
        phaseRef.current = "annotating";
        setPhaseState("annotating");
      } else {
        bgRectRef.current = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
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
        cursorPosRef.current,
        pickedColorRef.current,
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

  const selectFullScreenshot = useCallback(() => {
    const bgRect = bgRectRef.current;
    if (!bgRect) {
      showToast("截图还没准备好");
      return;
    }
    setTextInput(null);
    dragRef.current = null;
    curAnnRef.current = null;
    setSelectedAnnIndex(null);
    setTool(null);
    setSel(norm(bgRect));
    setPhase("annotating");
    showToast("已选择全屏");
    doRender();
  }, [doRender]);

  const copyPickedColor = useCallback(async () => {
    if (!pickedColorRef.current) {
      const fallbackPoint =
        cursorPosRef.current ??
        (selRef.current
          ? { x: norm(selRef.current).x + norm(selRef.current).w / 2, y: norm(selRef.current).y + norm(selRef.current).h / 2 }
          : null);
      if (!colorSamplerRef.current) colorSamplerRef.current = document.createElement("canvas");
      pickedColorRef.current = samplePickedColor(colorSamplerRef.current, bgImgRef.current, bgRectRef.current, fallbackPoint);
    }
    const picked = pickedColorRef.current;
    if (!picked) {
      showToast("当前没有可复制颜色");
      return;
    }
    try {
      await invoke("set_clipboard_text", { text: picked.hex });
      showToast(`已复制颜色 ${picked.hex}`);
    } catch (err) {
      console.error("copy picked color failed", err);
      showToast("复制颜色失败");
    }
  }, []);

  const handleRetryCapture = async () => {
    setCaptureError(null);
    setPhase("init");
    setSel(null);
    doRender();
    await getCurrentWindow().hide();
    window.setTimeout(() => {
      void invoke("toggle_screenshot_window").catch(err => {
        setCaptureError(String(err));
        setPhase("init");
      });
    }, 80);
  };

  // 鈹€鈹€ Init: size canvas, set up keyboard + screenshot-ready listener 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  useEffect(() => {
    resizeCanvas();
    loadPendingEdit();
    window.addEventListener("resize", syncCaptureViewport);

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleEscape();
        return;
      }
      if (e.key === "Enter" && phaseRef.current === "annotating") {
        e.preventDefault();
        e.stopPropagation();
        void handleConfirm();
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        e.stopPropagation();
        selectFullScreenshot();
        return;
      }
      if (!e.metaKey && !e.ctrlKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        e.stopPropagation();
        void copyPickedColor();
        return;
      }
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
    window.addEventListener("keydown", onKey, true);

    // Rust emits this event every time a new screenshot is ready.
    // Wait for the hidden overlay's first full-screen resize to reach WebKit
    // before reading innerWidth/innerHeight and sizing the canvas.
    const unlistenPromise = listen<string>("screenshot-ready", (event) => {
      if (!event.payload) return;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          loadScreenshotData(event.payload);
        });
      });
    });
    const unlistenErrorPromise = listen<string>("screenshot-error", (event) => {
      setCaptureError(event.payload || "截图失败");
      setPhase("init");
      resizeCanvas();
      doRender();
    });
    window.addEventListener("storage", loadPendingEdit);
    window.addEventListener("devlauncher-pending-screenshot-edit", loadPendingEdit);

    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", syncCaptureViewport);
      window.removeEventListener("storage", loadPendingEdit);
      window.removeEventListener("devlauncher-pending-screenshot-edit", loadPendingEdit);
      unlistenPromise.then(fn => fn());
      unlistenErrorPromise.then(fn => fn());
    };
  }, [resizeCanvas, syncCaptureViewport, loadScreenshotData, loadPendingEdit, selectFullScreenshot, copyPickedColor, doRender]);

  // 鈹€鈹€ Mouse position helper 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const getPos = (e: RMouseEvent<HTMLCanvasElement>): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // 鈹€鈹€ Mouse Down 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const onMouseDown = (e: RMouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || textInput) return;
    const rawPos = getPos(e);
    const pos = bgRectRef.current ? clampPointToRect(rawPos, bgRectRef.current) : rawPos;
    setCursor(pos);
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
    setCursor(pos);
    const dr  = dragRef.current;
    if (!dr) {
      doRender();
      return;
    }

    const bounds = bgRectRef.current ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    if (dr.mode === "sel-new") {
      const boundedPos = clampPointToRect(pos, bounds);
      selRef.current = clampRectToBounds(
        { x: dr.startMouse.x, y: dr.startMouse.y, w: boundedPos.x - dr.startMouse.x, h: boundedPos.y - dr.startMouse.y },
        bounds,
      );
    } else if (dr.mode === "sel-move") {
      const dx = pos.x - dr.startMouse.x;
      const dy = pos.y - dr.startMouse.y;
      const s  = dr.initSel!;
      selRef.current = clampRectToBounds({ x: s.x + dx, y: s.y + dy, w: s.w, h: s.h }, bounds);
    } else if (dr.mode === "sel-resize") {
      selRef.current = clampRectToBounds(resizeRect(dr.initSel!, dr.handleIdx!, dr.startMouse, pos), bounds);
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
    const scale = imageDisplayScale(bgImg, bgRect);
    const out = document.createElement("canvas");
    out.width  = Math.max(1, Math.round(sel.w * scale.x));
    out.height = Math.max(1, Math.round(sel.h * scale.y));
    const ctx = out.getContext("2d")!;
    if (bgRect) {
      const source = displayRectToImageRect(sel, bgImg, bgRect);
      ctx.drawImage(bgImg, source.x, source.y, source.w, source.h, 0, 0, out.width, out.height);
    } else {
      ctx.drawImage(bgImg, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
    }
    ctx.scale(scale.x, scale.y);
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
    const scale = imageDisplayScale(bgImg, bgRect);
    const out = document.createElement("canvas");
    out.width  = Math.max(1, Math.round(sel.w * scale.x));
    out.height = Math.max(1, Math.round(sel.h * scale.y));
    const ctx = out.getContext("2d")!;
    if (bgRect) {
      const source = displayRectToImageRect(sel, bgImg, bgRect);
      ctx.drawImage(bgImg, source.x, source.y, source.w, source.h, 0, 0, out.width, out.height);
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
    const selectedRect = selRef.current ? norm(selRef.current) : null;
    if (!out || !selectedRect) {
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
        }, "image/png");
      });
      const layout = await invoke<OcrLayout>("ocr_recognize_image_layout", { data: base64 });
      if (!layout.text.trim() || layout.lines.length === 0) {
        showToast("未识别到文字");
        return;
      }
      setOcrTextLayer({
        layout,
        selectionRect: selectedRect,
        selectedText: "",
      });
      showToast("已识别，可拖选文字");
    } catch (err) {
      console.error("ocr failed", err);
      showToast(`OCR 失败：${String(err)}`);
    } finally {
      setOcrBusy(false);
    }
  };

  const readOcrSelectedText = useCallback(() => {
    const root = ocrSelectableLayerRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return "";
    const { anchorNode, focusNode } = selection;
    if (!anchorNode || !focusNode || !root.contains(anchorNode) || !root.contains(focusNode)) return "";
    return selection.toString().trim();
  }, []);

  const syncOcrSelectionText = useCallback(() => {
    const text = readOcrSelectedText();
    setOcrTextLayer(layer => layer ? { ...layer, selectedText: text, translatedText: undefined, translateError: undefined } : layer);
  }, [readOcrSelectedText]);

  const getOcrLayerText = (layer = ocrTextLayer) => {
    if (!layer) return "";
    const liveSelection = readOcrSelectedText();
    if (liveSelection) return liveSelection;
    if (layer.selectedText?.trim()) return layer.selectedText.trim();
    return layer.layout.lines.map(line => line.text).join("\n").trim();
  };

  const friendlyTranslateError = (err: unknown) => {
    const message = String(err);
    const languagePair = message.split(":").slice(1).join(":").trim();
    if (message.includes("LANGUAGE_PACK_REQUIRED")) {
      return languagePair
        ? `需要先安装 macOS 系统翻译语言包（${languagePair}）。请打开“翻译”App下载对应语言后重试。`
        : "需要先安装 macOS 系统翻译语言包。请打开“翻译”App下载对应语言后重试。";
    }
    if (message.includes("UNSUPPORTED_LANGUAGE_PAIR")) {
      return languagePair ? `macOS 系统翻译暂不支持这个语言对（${languagePair}）。` : "macOS 系统翻译暂不支持这个语言对。";
    }
    if (message.includes("macOS system translation requires macOS 15")) {
      return "系统翻译需要 macOS 15 或更高版本。";
    }
    if (message.includes("TRANSLATION_TIMEOUT")) {
      return "macOS 系统翻译响应超时。请先打开“翻译”App确认对应语言已下载，然后重试。";
    }
    if (message.includes("unable to identify source language")) {
      return "无法识别这段文字的语言，请多选一点文字再试。";
    }
    return `翻译失败：${message}`;
  };

  const copyOcrSelection = async () => {
    const text = getOcrLayerText();
    if (!text) {
      showToast("没有可复制文字");
      return;
    }
    await invoke("set_clipboard_text", { text });
    showToast("已复制文字");
  };

  const translateOcrSelection = async (targetLanguage: "zh-Hans" | "en-US") => {
    const text = getOcrLayerText();
    if (!text) {
      showToast("没有可翻译文字");
      return;
    }
    setOcrTextLayer(layer => layer ? { ...layer, translateBusy: true, translatedText: undefined, translateError: undefined } : layer);
    try {
      const result = await invoke<TranslateResponse>("translate_text", { text, targetLanguage });
      setOcrTextLayer(layer => layer ? { ...layer, translateBusy: false, translatedText: result.targetText, translateError: undefined } : layer);
      showToast("已翻译");
    } catch (err) {
      const errorText = friendlyTranslateError(err);
      setOcrTextLayer(layer => layer ? { ...layer, translateBusy: false, translateError: errorText } : layer);
      showToast("翻译暂不可用");
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

  const handlePinScreenshot = async () => {
    commitTextInput();
    const out = buildResult();
    if (!out) {
      showToast("没有可钉住内容");
      return;
    }
    await new Promise<void>(resolve => {
      out.toBlob(async blob => {
        if (!blob) {
          showToast("钉住失败");
          resolve();
          return;
        }
        try {
          const base64 = toBase64(await blob.arrayBuffer());
          await invoke("create_pinned_screenshot_window", {
            data: base64,
            width: out.width,
            height: out.height,
          });
          showToast("已钉住到屏幕");
        } catch (err) {
          console.error("pin screenshot failed", err);
          showToast("钉住失败");
        }
        resolve();
      }, "image/png");
    });
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
    const copied = await handleCopy();
    if (copied) {
      handleCancel();
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
    setOcrTextLayer(null);
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
    if (ocrTextLayer) {
      setOcrTextLayer(null);
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
      return;
    }
    handleCancel();
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
    const GAP  = 8;
    const TB_W = Math.min(920, winW - GAP * 2);
    const TB_H = 52;
    const point = placeFloatingPanel(n, { w: TB_W, h: TB_H }, { w: winW, h: winH }, { gap: GAP, margin: GAP });
    return { top: point.y, left: point.x, width: TB_W };
  };

  const tbStyle = getToolbarStyle();
  const selectedAnn = selectedAnnIndex !== null ? annsRef.current[selectedAnnIndex] : null;
  const selectedCalloutAnn = selectedAnn && (selectedAnn.t === "marker" || selectedAnn.t === "boxCallout") ? selectedAnn : null;
  const selectedCalloutPos = selectedCalloutAnn
    ? calloutTextPos(selectedCalloutAnn.t === "marker" ? selectedCalloutAnn.pos : selectedCalloutAnn.labelPos, selectedCalloutAnn.label)
    : null;
  const selectedCalloutInput = selectedCalloutPos
    ? placeTextInput(selectedCalloutPos, { w: window.innerWidth, h: window.innerHeight }, { width: 180, height: 34, margin: 8 })
    : null;
  const textInputPlacement = textInput
    ? placeTextInput(textInput.pos, { w: window.innerWidth, h: window.innerHeight }, {
        width: textInput.target ? 180 : 220,
        height: textInput.target ? 34 : 40,
        margin: 8,
      })
    : null;
  const ocrScale = ocrTextLayer && ocrTextLayer.layout.width > 0 && ocrTextLayer.layout.height > 0
    ? {
        x: ocrTextLayer.selectionRect.w / ocrTextLayer.layout.width,
        y: ocrTextLayer.selectionRect.h / ocrTextLayer.layout.height,
      }
    : null;
  const ocrSelectedText = getOcrLayerText();

  // 鈹€鈹€ JSX 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  return (
    <div
      style={{ width: "100vw", height: "100vh", overflow: "hidden", userSelect: "none", background: "transparent" }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      {/* Full-screen canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: getCursor(), position: "absolute", top: 0, left: 0 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          setCursor(null);
          doRender();
        }}
      />

      {ocrTextLayer && ocrScale && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10020 }}>
          <div
            ref={ocrSelectableLayerRef}
            onMouseDown={event => {
              event.stopPropagation();
              setOcrTextLayer(layer => layer ? { ...layer, selectedText: "", translatedText: undefined, translateError: undefined } : layer);
            }}
            onMouseUp={event => {
              event.stopPropagation();
              window.setTimeout(syncOcrSelectionText, 0);
            }}
            onDoubleClick={event => {
              event.stopPropagation();
              window.setTimeout(syncOcrSelectionText, 0);
            }}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              userSelect: "text",
              WebkitUserSelect: "text",
              zIndex: 1,
            }}
          >
          {ocrTextLayer.layout.lines.map(line => {
            const left = ocrTextLayer.selectionRect.x + line.rect.x * ocrScale.x;
            const top = ocrTextLayer.selectionRect.y + line.rect.y * ocrScale.y;
            const width = Math.max(12, line.rect.width * ocrScale.x);
            const height = Math.max(10, line.rect.height * ocrScale.y);
            const fontSize = Math.max(10, Math.min(22, height * 0.82));
            return (
              <div
                key={line.id}
                title={line.text}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width,
                  height,
                  pointerEvents: "auto",
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(59,130,246,0.1)",
                  borderRadius: 4,
                  boxShadow: "none",
                  cursor: "text",
                  padding: "0 2px",
                  zIndex: 1,
                  color: "rgba(255,255,255,0.02)",
                  fontSize,
                  lineHeight: `${height}px`,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textAlign: "left",
                  userSelect: "text",
                  WebkitUserSelect: "text",
                }}
              >
                {line.text}
              </div>
            );
          })}
          </div>

          <div
            style={{
              position: "fixed",
              left: "50%",
              bottom: 22,
              transform: "translateX(-50%)",
              width: Math.min(520, window.innerWidth - 16),
              pointerEvents: "auto",
              padding: 8,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(20,20,24,0.96)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.52)",
              color: "rgba(255,255,255,0.9)",
              zIndex: 2147483000,
            }}
            onMouseDown={event => event.stopPropagation()}
            onMouseUp={event => event.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "nowrap", position: "relative", zIndex: 2 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginRight: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 80 }}>
                {ocrTextLayer.selectedText?.trim() ? "处理拖选文字" : "未拖选时处理全文"}
              </div>
              <button type="button" onClick={copyOcrSelection} style={OCR_ACTION_BTN}>复制</button>
              <button type="button" onClick={() => translateOcrSelection("en-US")} disabled={ocrTextLayer.translateBusy || !ocrSelectedText} style={OCR_ACTION_BTN}>
                译成英文
              </button>
              <button type="button" onClick={() => translateOcrSelection("zh-Hans")} disabled={ocrTextLayer.translateBusy || !ocrSelectedText} style={OCR_ACTION_BTN}>
                译成中文
              </button>
              <button type="button" onClick={() => setOcrTextLayer(null)} style={OCR_ACTION_BTN}>关闭</button>
            </div>
            {ocrTextLayer.translateBusy && (
              <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.58)", position: "relative", zIndex: 1 }}>正在调用系统翻译...</div>
            )}
            {ocrTextLayer.translateError && (
              <div style={{
                marginTop: 8,
                fontSize: 12,
                lineHeight: 1.45,
                color: "rgba(255,210,120,0.95)",
                position: "relative",
                zIndex: 1,
              }}>
                {ocrTextLayer.translateError}
              </div>
            )}
            {ocrTextLayer.translatedText && (
              <div style={{
                marginTop: 8,
                maxHeight: 92,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                fontSize: 12,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.86)",
                position: "relative",
                zIndex: 1,
              }}>
                {ocrTextLayer.translatedText}
              </div>
            )}
          </div>
        </div>
      )}

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
          pointerEvents: captureError ? "auto" : "none",
        }}>
          <div style={{
            color: "rgba(255,255,255,0.78)", fontSize: 13,
            background: "rgba(0,0,0,0.62)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: captureError ? "14px 16px" : "6px 14px",
            maxWidth: "min(420px, calc(100vw - 32px))",
            boxShadow: "0 14px 40px rgba(0,0,0,0.34)",
          }}>
            {captureError ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 700 }}>截图失败</div>
                <div style={{ lineHeight: 1.45, wordBreak: "break-word" }}>
                  {captureError.includes("screencapture")
                    ? "系统截图没有返回图片。请检查 macOS 屏幕录制权限后重试。"
                    : captureError}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={handleCancel}
                    style={{
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.84)",
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleRetryCapture}
                    style={{
                      border: "1px solid rgba(78,186,255,0.4)",
                      background: "rgba(78,186,255,0.16)",
                      color: "rgba(255,255,255,0.94)",
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    重试
                  </button>
                </div>
              </div>
            ) : "正在截图..."}
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
          拖动鼠标选择截图区域 · F 全屏 · C 复制颜色 · Esc 取消
        </div>
      )}

      {phase === "annotating" && selection && (
        <div style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.58)",
          fontSize: 12,
          background: "rgba(0,0,0,0.38)",
          borderRadius: 9,
          padding: "5px 12px",
          pointerEvents: "none",
          zIndex: 9998,
        }}>
          F 全屏 · C 复制颜色 · Enter 复制 · Esc 取消
        </div>
      )}

      {/* Mac-style toolbar */}
      {phase === "annotating" && selection && tbStyle && (
        <Toolbar
          activeTool={activeTool}
          activeColor={activeColor}
          onTool={setTool}
          onColor={setColor}
          onUndo={handleUndo}
          onSelectFullScreen={selectFullScreenshot}
          onPinScreenshot={handlePinScreenshot}
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

      {selectedCalloutAnn && selectedCalloutInput && !textInput && (
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
            left: selectedCalloutInput.point.x,
            top: selectedCalloutInput.point.y,
            width: selectedCalloutInput.width,
            boxSizing: "border-box",
            background: "rgba(28,28,30,0.88)",
            border: "1px solid rgba(255,255,255,0.22)",
            color: "rgba(255,255,255,0.94)",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            outline: "none",
            textOverflow: "ellipsis",
            padding: "6px 9px",
            borderRadius: 8,
            boxShadow: "0 10px 28px rgba(0,0,0,0.34)",
            zIndex: 10003,
          }}
        />
      )}

      {/* Floating text input */}
      {textInput && textInputPlacement && (
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
            left: textInputPlacement.point.x,
            top: textInputPlacement.point.y,
            background: textInput.target ? "rgba(28,28,30,0.82)" : "rgba(0,0,0,0.55)",
            border: textInput.target ? "1px solid rgba(255,255,255,0.18)" : "none",
            borderBottom: textInput.target ? "1px solid rgba(255,255,255,0.22)" : `2.5px solid ${activeColor}`,
            color: textInput.target ? "rgba(255,255,255,0.94)" : activeColor,
            fontSize: textInput.target ? 13 : 20,
            fontWeight: textInput.target ? 600 : "bold",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            outline: "none",
            width: textInputPlacement.width,
            minWidth: Math.min(textInputPlacement.width, textInput.target ? 150 : 130),
            boxSizing: "border-box",
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
