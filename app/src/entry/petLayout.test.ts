import { describe, expect, it } from "vitest";
import {
  CURRENT_PET_WINDOW_SIZE,
  PET_BUTTON_SIZE,
  PET_CLOSED_WINDOW_SIZE,
  PET_IMAGE_WIDTH,
  PET_KEYBOARD_IMAGE_WIDTH,
  PET_MENU_BUTTON_SIZE,
  PET_MENU_ITEMS,
  PET_OPEN_WINDOW_SIZE,
  getCenteredResizeOffset,
  getPetWindowArea,
} from "./petLayout";

describe("pet compact layout", () => {
  it("uses a compact default window and compact expanded window", () => {
    expect(PET_CLOSED_WINDOW_SIZE).toEqual({ width: 152, height: 136 });
    expect(PET_OPEN_WINDOW_SIZE).toEqual({ width: 172, height: 152 });
    expect(getPetWindowArea(PET_CLOSED_WINDOW_SIZE)).toBe(20672);
    expect(getPetWindowArea(PET_OPEN_WINDOW_SIZE)).toBe(26144);
    expect(getPetWindowArea(PET_OPEN_WINDOW_SIZE)).toBeLessThan(getPetWindowArea(CURRENT_PET_WINDOW_SIZE));
  });

  it("shrinks pet visual sizes", () => {
    expect(PET_BUTTON_SIZE).toEqual({ width: 116, height: 102 });
    expect(PET_IMAGE_WIDTH).toBe(132);
    expect(PET_KEYBOARD_IMAGE_WIDTH).toBe(148);
  });

  it("keeps four corner menu actions and removes custom action", () => {
    expect(PET_MENU_ITEMS.map((item) => item.action)).toEqual([
      "search",
      "report",
      "clip",
      "keyboard",
    ]);
    expect(PET_MENU_ITEMS).toHaveLength(4);
    expect(PET_MENU_ITEMS.map((item) => item.action as string)).not.toContain("custom-action");
  });

  it("places menu buttons near the four pet corners", () => {
    expect(PET_MENU_BUTTON_SIZE).toEqual({ width: 34, height: 30 });
    expect(PET_MENU_ITEMS.map((item) => [item.action, item.left, item.top])).toEqual([
      ["search", 42, 36],
      ["report", 130, 36],
      ["clip", 42, 116],
      ["keyboard", 130, 116],
    ]);
  });

  it("keeps the pet centered while resizing the window", () => {
    expect(getCenteredResizeOffset(PET_CLOSED_WINDOW_SIZE, PET_OPEN_WINDOW_SIZE)).toEqual({
      x: -10,
      y: -8,
    });
    expect(getCenteredResizeOffset(PET_OPEN_WINDOW_SIZE, PET_CLOSED_WINDOW_SIZE)).toEqual({
      x: 10,
      y: 8,
    });
  });
});
