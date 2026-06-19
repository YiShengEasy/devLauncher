import { describe, expect, it } from "vitest";
import type { Action } from "@/types/actions";
import {
  CURRENT_PET_WINDOW_SIZE,
  PET_BUTTON_SIZE,
  PET_CLOSED_WINDOW_SIZE,
  PET_IMAGE_WIDTH,
  PET_KEYBOARD_IMAGE_WIDTH,
  PET_MENU_BUTTON_SIZE,
  PET_KEYBOARD_MENU_ITEM,
  PET_OPEN_WINDOW_SIZE,
  buildPetMenuItems,
  getCenteredResizeOffset,
  getPetWindowArea,
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

  it("shows only fixed keyboard mode when no custom actions are configured", () => {
    expect(buildPetMenuItems([null, null, null])).toEqual([PET_KEYBOARD_MENU_ITEM]);
  });

  it("combines up to three custom actions with the fixed keyboard item", () => {
    const items = buildPetMenuItems([clipboardAction, jsonAction, docsAction]);

    expect(items.map((item) => item.kind)).toEqual(["custom", "custom", "custom", "keyboard"]);
    expect(items.map((item) => item.label)).toEqual(["剪切板", "JSON", "Docs", "键盘"]);
    expect(items.map((item) => [item.left, item.top])).toEqual([
      [42, 36],
      [130, 36],
      [42, 116],
      [130, 116],
    ]);
  });

  it("keeps the fixed keyboard button in the bottom-right position", () => {
    expect(PET_MENU_BUTTON_SIZE).toEqual({ width: 34, height: 30 });
    expect(PET_KEYBOARD_MENU_ITEM).toMatchObject({
      kind: "keyboard",
      label: "键盘",
      left: 130,
      top: 116,
    });
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
