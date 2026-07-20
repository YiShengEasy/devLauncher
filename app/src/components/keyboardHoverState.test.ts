import { describe, expect, it } from "vitest";
import type { KeyId } from "@/types/actions";
import { nextKeyboardHoverKey } from "./keyboardHoverState";

describe("nextKeyboardHoverKey", () => {
  it("keeps only the latest key hovered when mouseleave is missing", () => {
    let current: KeyId | null = null;

    current = nextKeyboardHoverKey(current, "6", true, false);
    current = nextKeyboardHoverKey(current, "7", true, false);

    expect(current).toBe("7");
  });

  it("ignores a late mouseleave from an older key", () => {
    let current: KeyId | null = "7";

    current = nextKeyboardHoverKey(current, "6", false, false);

    expect(current).toBe("7");
  });

  it("clears hover while dragging", () => {
    expect(nextKeyboardHoverKey("7", "T", true, true)).toBeNull();
  });
});
