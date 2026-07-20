import { describe, expect, it } from "vitest";
import type { Action } from "@/types/actions";
import {
  CURRENT_PET_WINDOW_SIZE,
  PET_BUTTON_SIZE,
  PET_CLOSED_WINDOW_SIZE,
  PET_IMAGE_WIDTH,
  PET_KEYBOARD_IMAGE_WIDTH,
  PET_MENU_CENTER,
  PET_MENU_BUTTON_SIZE,
  PET_MENU_INNER_RADIUS,
  PET_MENU_OUTER_RADIUS,
  PET_KEYBOARD_MENU_ITEM,
  PET_OPEN_WINDOW_SIZE,
  buildPetMenuItems,
  clampPetWindowPosition,
  getCenteredResizeOffset,
  getPetWindowArea,
  getScaledCenteredResizeOffset,
} from "./petLayout";

const clipboardAction: Action = {
  type: "builtin",
  name: "剪切板",
  feature: "clipboard",
};

const jsonAction: Action = {
  type: "builtin",
  name: "JSON",
  feature: "json",
};

const docsAction: Action = {
  type: "url",
  name: "Docs",
  target: "https://example.com",
};

describe("pet compact layout", () => {
  it("uses a compact default window and compact expanded window", () => {
    expect(PET_CLOSED_WINDOW_SIZE).toEqual({ width: 152, height: 136 });
    expect(PET_OPEN_WINDOW_SIZE).toEqual({ width: 272, height: 272 });
    expect(getPetWindowArea(PET_CLOSED_WINDOW_SIZE)).toBe(20672);
    expect(getPetWindowArea(PET_OPEN_WINDOW_SIZE)).toBe(73984);
    expect(getPetWindowArea(PET_OPEN_WINDOW_SIZE)).toBeLessThan(getPetWindowArea(CURRENT_PET_WINDOW_SIZE));
  });

  it("shrinks pet visual sizes", () => {
    expect(PET_BUTTON_SIZE).toEqual({ width: 116, height: 102 });
    expect(PET_IMAGE_WIDTH).toBe(132);
    expect(PET_KEYBOARD_IMAGE_WIDTH).toBe(148);
  });

  it("shows only fixed keyboard mode when no custom actions are configured", () => {
    expect(buildPetMenuItems([null, null, null])).toEqual([PET_KEYBOARD_MENU_ITEM]);
  });

  it("combines up to three custom actions with the fixed keyboard item", () => {
    const items = buildPetMenuItems([clipboardAction, jsonAction, docsAction]);

    expect(items.map((item) => item.kind)).toEqual(["custom", "custom", "custom", "keyboard"]);
    expect(items.map((item) => item.label)).toEqual(["剪切板", "JSON", "Docs", "键盘"]);
    expect(items.map((item) => [item.left, item.top])).toEqual([
      [136, 40],
      [232, 136],
      [40, 136],
      [136, 232],
    ]);
    expect(items.map((item) => item.sector)).toEqual([0, 1, 3, 2]);
  });

  it("keeps the fixed keyboard action in the bottom sector", () => {
    expect(PET_MENU_BUTTON_SIZE).toEqual({ width: 58, height: 44 });
    expect(PET_MENU_CENTER).toEqual({ x: 136, y: 136 });
    expect(PET_MENU_INNER_RADIUS).toBeLessThan(PET_MENU_OUTER_RADIUS);
    expect(PET_KEYBOARD_MENU_ITEM).toMatchObject({
      kind: "keyboard",
      label: "键盘",
      left: 136,
      top: 232,
      angle: 90,
      sector: 2,
    });
  });

  it("keeps the pet centered while resizing the window", () => {
    expect(getCenteredResizeOffset(PET_CLOSED_WINDOW_SIZE, PET_OPEN_WINDOW_SIZE)).toEqual({
      x: -60,
      y: -68,
    });
    expect(getCenteredResizeOffset(PET_OPEN_WINDOW_SIZE, PET_CLOSED_WINDOW_SIZE)).toEqual({
      x: 60,
      y: 68,
    });
    expect(getScaledCenteredResizeOffset(
      PET_CLOSED_WINDOW_SIZE,
      PET_OPEN_WINDOW_SIZE,
      2,
    )).toEqual({
      x: -120,
      y: -136,
    });
  });

  it("keeps the expanded radial menu inside the current work area", () => {
    expect(clampPetWindowPosition(
      { x: -80, y: 900 },
      { width: 544, height: 544 },
      {
        position: { x: 0, y: 25 },
        size: { width: 1440, height: 875 },
      },
    )).toEqual({
      x: 0,
      y: 356,
    });

    expect(clampPetWindowPosition(
      { x: -1700, y: 40 },
      { width: 272, height: 272 },
      {
        position: { x: -1920, y: 0 },
        size: { width: 1920, height: 1080 },
      },
    )).toEqual({
      x: -1700,
      y: 40,
    });
  });
});
