export type MemoryKind = "command" | "shortcut";
export type MemorySource = "builtin" | "custom";
export type CategoryId = string;

export interface MemoryCategory {
  id: CategoryId;
  name: string;
  subtitle: string;
  accent: string;
  source: MemorySource;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemoryItem {
  id: string;
  category: CategoryId;
  title: string;
  value: string;
  detail: string;
  kind: MemoryKind;
  tags: string[];
  priority?: boolean;
  source: MemorySource;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomMemoryCategory {
  id: CategoryId;
  name: string;
  subtitle: string;
  accent: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomMemoryItem {
  id: string;
  category: CategoryId;
  title: string;
  value: string;
  detail: string;
  kind: MemoryKind;
  tags: string[];
  priority: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrderState = Record<CategoryId, string[]>;
export type CopyCounts = Record<string, number>;

export interface QuickMemoryData {
  customCategories: CustomMemoryCategory[];
  customItems: CustomMemoryItem[];
  order: OrderState;
  copyCounts: CopyCounts;
}

export interface MergedQuickMemoryData {
  categories: MemoryCategory[];
  items: MemoryItem[];
  order: OrderState;
  copyCounts: CopyCounts;
}

export interface PointerDragState {
  itemId: string;
  startX: number;
  startY: number;
  isDragging: boolean;
}

export const EMPTY_QUICKMEMORY_DATA: QuickMemoryData = {
  customCategories: [],
  customItems: [],
  order: {},
  copyCounts: {},
};

export const kindLabel: Record<MemoryKind, string> = {
  command: "命令",
  shortcut: "快捷键",
};
