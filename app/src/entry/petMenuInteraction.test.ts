import { describe, expect, it } from "vitest";
import {
  PET_WINDOW_DRAG_THRESHOLD,
  shouldStartPetWindowDrag,
} from "./petMenuInteraction";

describe("pet pointer interaction", () => {
  it("starts moving the pet with a plain mouse drag past the movement threshold", () => {
    const origin = { x: 100, y: 100 };

    expect(shouldStartPetWindowDrag(origin, {
      x: 100 + PET_WINDOW_DRAG_THRESHOLD - 1,
      y: 100,
    })).toBe(false);
    expect(shouldStartPetWindowDrag(origin, {
      x: 100 + PET_WINDOW_DRAG_THRESHOLD,
      y: 100,
    })).toBe(true);
  });
});
