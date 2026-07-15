export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

const MIN_PANEL_SIZE = 1;

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

export function normRect(rect: Rect): Rect {
  return {
    x: Math.min(rect.x, rect.x + rect.w),
    y: Math.min(rect.y, rect.y + rect.h),
    w: Math.abs(rect.w),
    h: Math.abs(rect.h),
  };
}

export function clampPointToRect(point: Pt, bounds: Rect, inset = 0): Pt {
  const area = normRect(bounds);
  return {
    x: clamp(point.x, area.x + inset, area.x + area.w - inset),
    y: clamp(point.y, area.y + inset, area.y + area.h - inset),
  };
}

export function clampRectToBounds(rect: Rect, bounds: Rect): Rect {
  const source = normRect(rect);
  const area = normRect(bounds);
  const w = Math.min(source.w, area.w);
  const h = Math.min(source.h, area.h);
  return {
    x: clamp(source.x, area.x, area.x + area.w - w),
    y: clamp(source.y, area.y, area.y + area.h - h),
    w,
    h,
  };
}

export function fitImageInViewport(
  image: Size,
  viewport: Size,
  options: { margin?: number; toolbarReserve?: number } = {},
): Rect {
  const margin = options.margin ?? 0;
  const toolbarReserve = options.toolbarReserve ?? 0;
  const maxW = Math.max(1, viewport.w - margin * 2);
  const maxH = Math.max(1, viewport.h - margin * 2 - toolbarReserve);
  const scale = Math.min(1, maxW / Math.max(1, image.w), maxH / Math.max(1, image.h));
  const w = Math.max(1, Math.round(image.w * scale));
  const h = Math.max(1, Math.round(image.h * scale));
  const x = Math.round((viewport.w - w) / 2);
  const usableTop = margin;
  const usableH = Math.max(1, viewport.h - toolbarReserve - margin * 2);
  const y = Math.round(usableTop + (usableH - h) / 2);
  return clampRectToBounds({ x, y, w, h }, { x: margin, y: margin, w: maxW, h: maxH });
}

export function placeFloatingPanel(
  anchor: Rect,
  panel: Size,
  viewport: Size,
  options: { gap?: number; margin?: number } = {},
): Pt {
  const n = normRect(anchor);
  const gap = options.gap ?? 8;
  const margin = options.margin ?? 8;
  const panelW = Math.max(MIN_PANEL_SIZE, Math.min(panel.w, viewport.w - margin * 2));
  const panelH = Math.max(MIN_PANEL_SIZE, Math.min(panel.h, viewport.h - margin * 2));
  let y = n.y + n.h + gap;
  if (y + panelH + margin > viewport.h && n.y - panelH - gap >= margin) {
    y = n.y - panelH - gap;
  }
  if (y + panelH + margin > viewport.h) {
    y = viewport.h - panelH - margin;
  }
  const x = clamp(n.x + n.w / 2 - panelW / 2, margin, viewport.w - panelW - margin);
  return { x, y: clamp(y, margin, viewport.h - panelH - margin) };
}

export function placeTextInput(
  point: Pt,
  viewport: Size,
  options: { width?: number; height?: number; margin?: number } = {},
): { point: Pt; width: number } {
  const margin = options.margin ?? 8;
  const requestedW = options.width ?? 180;
  const height = options.height ?? 36;
  const width = Math.max(80, Math.min(requestedW, viewport.w - margin * 2));
  return {
    width,
    point: {
      x: clamp(point.x, margin, viewport.w - width - margin),
      y: clamp(point.y, margin, viewport.h - height - margin),
    },
  };
}

export function constrainTextWidth(measuredWidth: number, x: number, viewportWidth: number, margin = 8): number {
  return Math.max(72, Math.min(measuredWidth, viewportWidth - x - margin));
}
