export const PET_WINDOW_DRAG_THRESHOLD = 8;

export type PetMenuPoint = {
  x: number;
  y: number;
};

export function shouldStartPetWindowDrag(
  origin: PetMenuPoint,
  point: PetMenuPoint,
): boolean {
  return Math.hypot(point.x - origin.x, point.y - origin.y) >= PET_WINDOW_DRAG_THRESHOLD;
}
