import { describe, expect, it } from "vitest";
import {
  clampPointToRect,
  clampRectToBounds,
  fitImageInViewport,
  placeFloatingPanel,
  placeTextInput,
} from "./geometry";

describe("screenshot geometry", () => {
  it("clamps points into the capture bounds", () => {
    expect(clampPointToRect({ x: -20, y: 500 }, { x: 10, y: 20, w: 300, h: 200 })).toEqual({
      x: 10,
      y: 220,
    });
  });

  it("keeps moved selections inside the displayed screenshot", () => {
    expect(clampRectToBounds({ x: 260, y: -20, w: 80, h: 90 }, { x: 0, y: 0, w: 320, h: 240 })).toEqual({
      x: 240,
      y: 0,
      w: 80,
      h: 90,
    });
  });

  it("fits a large image while reserving toolbar space", () => {
    const rect = fitImageInViewport({ w: 3000, h: 2000 }, { w: 1200, h: 800 }, { margin: 24, toolbarReserve: 96 });

    expect(rect.x).toBeGreaterThanOrEqual(24);
    expect(rect.y).toBeGreaterThanOrEqual(24);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1176);
    expect(rect.y + rect.h).toBeLessThanOrEqual(680);
  });

  it("places floating panels above an anchor near the bottom edge", () => {
    const pos = placeFloatingPanel({ x: 300, y: 720, w: 200, h: 60 }, { w: 560, h: 84 }, { w: 900, h: 820 });

    expect(pos.y).toBeLessThan(720);
    expect(pos.x).toBeGreaterThanOrEqual(8);
    expect(pos.x + 560).toBeLessThanOrEqual(892);
  });

  it("clamps text inputs at the right and bottom edges", () => {
    expect(placeTextInput({ x: 780, y: 580 }, { w: 800, h: 600 }, { width: 180, height: 36 })).toEqual({
      width: 180,
      point: { x: 612, y: 556 },
    });
  });
});
