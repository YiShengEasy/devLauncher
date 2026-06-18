export type PetWindowSize = {
  width: number;
  height: number;
};

export type PetAction = "search" | "report" | "clip" | "keyboard";

export type PetMenuItem = {
  label: string;
  title: string;
  left: number;
  top: number;
  action: PetAction;
};

export const CURRENT_PET_WINDOW_SIZE: PetWindowSize = { width: 284, height: 284 };
export const PET_CLOSED_WINDOW_SIZE: PetWindowSize = { width: 152, height: 136 };
export const PET_OPEN_WINDOW_SIZE: PetWindowSize = { width: 172, height: 152 };
export const PET_BUTTON_SIZE: PetWindowSize = { width: 116, height: 102 };
export const PET_MENU_BUTTON_SIZE: PetWindowSize = { width: 34, height: 30 };
export const PET_IMAGE_WIDTH = 132;
export const PET_KEYBOARD_IMAGE_WIDTH = 148;
export const PET_MENU_CLOSE_DELAY_MS = 180;

export const PET_MENU_ITEMS: PetMenuItem[] = [
  { label: "搜索", title: "打开搜索", left: 42, top: 36, action: "search" },
  { label: "报告", title: "打开截图报告", left: 130, top: 36, action: "report" },
  { label: "剪贴", title: "打开剪贴板", left: 42, top: 116, action: "clip" },
  { label: "键盘", title: "切换到键盘模式", left: 130, top: 116, action: "keyboard" },
];

export function getPetWindowArea(size: PetWindowSize): number {
  return size.width * size.height;
}

export function getCenteredResizeOffset(from: PetWindowSize, to: PetWindowSize): { x: number; y: number } {
  return {
    x: Math.round((from.width - to.width) / 2),
    y: Math.round((from.height - to.height) / 2),
  };
}
