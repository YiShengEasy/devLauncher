import type { Action } from "@/types/actions";

export type PetWindowSize = {
  width: number;
  height: number;
};

export type PetWindowPosition = {
  x: number;
  y: number;
};

export type PetWindowBounds = {
  position: PetWindowPosition;
  size: PetWindowSize;
};

export type PetFixedAction = "keyboard";
export type PetMenuSector = 0 | 1 | 2 | 3;

export type PetMenuItem =
  | {
      kind: "custom";
      slotIndex: number;
      label: string;
      title: string;
      left: number;
      top: number;
      angle: number;
      sector: PetMenuSector;
      action: Action;
    }
  | {
      kind: "keyboard";
      label: string;
      title: string;
      left: number;
      top: number;
      angle: number;
      sector: PetMenuSector;
      action: PetFixedAction;
    };

export const CURRENT_PET_WINDOW_SIZE: PetWindowSize = { width: 284, height: 284 };
export const PET_CLOSED_WINDOW_SIZE: PetWindowSize = { width: 152, height: 136 };
export const PET_OPEN_WINDOW_SIZE: PetWindowSize = { width: 272, height: 272 };
export const PET_BUTTON_SIZE: PetWindowSize = { width: 116, height: 102 };
export const PET_MENU_BUTTON_SIZE: PetWindowSize = { width: 58, height: 44 };
export const PET_IMAGE_WIDTH = 132;
export const PET_KEYBOARD_IMAGE_WIDTH = 148;
export const PET_MENU_CLOSE_DELAY_MS = 180;
export const PET_MENU_CENTER = {
  x: PET_OPEN_WINDOW_SIZE.width / 2,
  y: PET_OPEN_WINDOW_SIZE.height / 2,
} as const;
export const PET_MENU_INNER_RADIUS = 60;
export const PET_MENU_OUTER_RADIUS = 128;
export const PET_MENU_ITEM_RADIUS = 96;

const PET_CUSTOM_MENU_DIRECTIONS = [
  { angle: -90, sector: 0 as const },
  { angle: 0, sector: 1 as const },
  { angle: 180, sector: 3 as const },
] as const;

function getMenuItemPosition(angle: number) {
  const radians = angle * Math.PI / 180;
  return {
    left: PET_MENU_CENTER.x + Math.cos(radians) * PET_MENU_ITEM_RADIUS,
    top: PET_MENU_CENTER.y + Math.sin(radians) * PET_MENU_ITEM_RADIUS,
  };
}

const keyboardPosition = getMenuItemPosition(90);

export const PET_KEYBOARD_MENU_ITEM: PetMenuItem = {
  kind: "keyboard",
  label: "键盘",
  title: "切换到键盘模式",
  ...keyboardPosition,
  angle: 90,
  sector: 2,
  action: "keyboard",
};

export function buildPetMenuItems(customActions: Array<Action | null | undefined>): PetMenuItem[] {
  const customItems = PET_CUSTOM_MENU_DIRECTIONS.flatMap((direction, index) => {
    const action = customActions[index];
    if (!action) return [];

    const position = getMenuItemPosition(direction.angle);
    return [{
      kind: "custom" as const,
      slotIndex: index,
      label: action.name,
      title: action.name,
      ...position,
      angle: direction.angle,
      sector: direction.sector,
      action,
    }];
  });

  return [...customItems, PET_KEYBOARD_MENU_ITEM];
}

export function getPetMenuItemKey(item: PetMenuItem): string {
  return item.kind === "keyboard" ? "keyboard" : `custom-${item.slotIndex}`;
}

export function getPetWindowArea(size: PetWindowSize): number {
  return size.width * size.height;
}

export function getCenteredResizeOffset(from: PetWindowSize, to: PetWindowSize): { x: number; y: number } {
  return {
    x: Math.round((from.width - to.width) / 2),
    y: Math.round((from.height - to.height) / 2),
  };
}

export function getScaledCenteredResizeOffset(
  from: PetWindowSize,
  to: PetWindowSize,
  scaleFactor: number,
): PetWindowPosition {
  const offset = getCenteredResizeOffset(from, to);
  return {
    x: Math.round(offset.x * scaleFactor),
    y: Math.round(offset.y * scaleFactor),
  };
}

export function clampPetWindowPosition(
  position: PetWindowPosition,
  windowSize: PetWindowSize,
  workArea: PetWindowBounds,
): PetWindowPosition {
  const maxX = workArea.position.x + Math.max(0, workArea.size.width - windowSize.width);
  const maxY = workArea.position.y + Math.max(0, workArea.size.height - windowSize.height);

  return {
    x: Math.min(Math.max(position.x, workArea.position.x), maxX),
    y: Math.min(Math.max(position.y, workArea.position.y), maxY),
  };
}
