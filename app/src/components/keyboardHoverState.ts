import type { KeyId } from "@/types/actions";

export function nextKeyboardHoverKey(
  current: KeyId | null,
  keyId: KeyId,
  hovered: boolean,
  isDragging: boolean,
): KeyId | null {
  if (isDragging) return null;
  if (hovered) return keyId;
  return current === keyId ? null : current;
}
