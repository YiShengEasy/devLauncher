import { invoke } from "@tauri-apps/api/core";
import type { CopyCounts, OrderState, QuickMemoryData } from "./model";

export const COPY_COUNT_STORAGE_KEY = "devlauncher.quickmemory.copyCounts";
export const ORDER_STORAGE_KEY = "devlauncher.quickmemory.order";

export async function loadQuickMemoryData(): Promise<QuickMemoryData> {
  const data = await invoke<QuickMemoryData>("load_quickmemory_data");
  return mergeLocalQuickMemoryState(normalizeQuickMemoryData(data));
}

export async function saveQuickMemoryData(data: QuickMemoryData): Promise<void> {
  await invoke("save_quickmemory_data", { data: normalizeQuickMemoryData(data) });
}

export function mergeLocalQuickMemoryState(data: QuickMemoryData): QuickMemoryData {
  return {
    ...data,
    order: {
      ...readLocalOrderState(),
      ...data.order,
    },
    copyCounts: {
      ...readLocalCopyCounts(),
      ...data.copyCounts,
    },
  };
}

export function normalizeQuickMemoryData(data: Partial<QuickMemoryData> | null | undefined): QuickMemoryData {
  return {
    customCategories: Array.isArray(data?.customCategories) ? data.customCategories : [],
    customItems: Array.isArray(data?.customItems) ? data.customItems : [],
    order: normalizeOrderState(data?.order),
    copyCounts: normalizeCopyCounts(data?.copyCounts),
  };
}

function readLocalCopyCounts(): CopyCounts {
  try {
    const raw = window.localStorage.getItem(COPY_COUNT_STORAGE_KEY);
    if (!raw) return {};
    return normalizeCopyCounts(JSON.parse(raw));
  } catch {
    return {};
  }
}

function readLocalOrderState(): OrderState {
  try {
    const raw = window.localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return {};
    return normalizeOrderState(JSON.parse(raw));
  } catch {
    return {};
  }
}

function normalizeCopyCounts(value: unknown): CopyCounts {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      .map(([key, count]) => [key, Math.max(0, count)])
  );
}

function normalizeOrderState(value: unknown): OrderState {
  if (!value || typeof value !== "object") return {};
  const next: OrderState = {};
  for (const [categoryId, ids] of Object.entries(value)) {
    if (Array.isArray(ids)) {
      next[categoryId] = ids.filter((id): id is string => typeof id === "string");
    }
  }
  return next;
}
