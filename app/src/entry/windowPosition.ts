export type EntryWindowMode = "main" | "pet";

export interface EntryWindowPosition {
  x: number;
  y: number;
}

export const ENTRY_POSITION_STORAGE_KEY = "devlauncher.entryWindowPositions";

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readAllPositions(): Partial<Record<EntryWindowMode, EntryWindowPosition>> {
  if (typeof localStorage === "undefined") return {};

  try {
    const raw = localStorage.getItem(ENTRY_POSITION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<
      Record<EntryWindowMode, EntryWindowPosition>
    >;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getStoredEntryPosition(
  mode: EntryWindowMode,
): EntryWindowPosition | null {
  const value = readAllPositions()[mode];
  if (!value || !isFiniteCoordinate(value.x) || !isFiniteCoordinate(value.y)) {
    return null;
  }
  return { x: Math.round(value.x), y: Math.round(value.y) };
}

export function setStoredEntryPosition(
  mode: EntryWindowMode,
  position: EntryWindowPosition,
): void {
  if (typeof localStorage === "undefined") return;
  if (!isFiniteCoordinate(position.x) || !isFiniteCoordinate(position.y)) return;

  const next = {
    ...readAllPositions(),
    [mode]: {
      x: Math.round(position.x),
      y: Math.round(position.y),
    },
  };
  localStorage.setItem(ENTRY_POSITION_STORAGE_KEY, JSON.stringify(next));
}
