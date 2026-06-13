import { emit } from "@tauri-apps/api/event";

export type StoredScreenshot = {
  id: string;
  data: string;
  width: number;
  height: number;
  createdAt: number;
  title: string;
  annotations?: StoredScreenshotAnnotation[];
};

export type StoredScreenshotAnnotation = {
  id: number;
  label: string;
  tone?: "problem" | "expected" | "focus";
  x: number;
  y: number;
  kind?: "marker" | "boxCallout";
  color?: string;
  burnedIn?: boolean;
};

export const SCREENSHOT_STORE_KEY = "devlauncher_screenshots";
export const PENDING_SCREENSHOT_EDIT_KEY = "devlauncher_pending_screenshot_edit";

export type PendingScreenshotEdit = Pick<StoredScreenshot, "id" | "data" | "width" | "height" | "annotations">;

export function loadScreenshots(): StoredScreenshot[] {
  try {
    const raw = localStorage.getItem(SCREENSHOT_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScreenshots(items: StoredScreenshot[]) {
  localStorage.setItem(SCREENSHOT_STORE_KEY, JSON.stringify(items.slice(0, 40)));
  window.dispatchEvent(new Event("devlauncher-screenshots-updated"));
  void emit("screenshots-updated").catch(() => {});
}

export function updateScreenshot(id: string, patch: Partial<Omit<StoredScreenshot, "id" | "createdAt">>) {
  const next = loadScreenshots().map((item) => item.id === id ? { ...item, ...patch } : item);
  saveScreenshots(next);
  return next.find((item) => item.id === id) ?? null;
}

export function deleteScreenshot(id: string) {
  const next = loadScreenshots().filter((item) => item.id !== id);
  saveScreenshots(next);
  return next;
}

export function clearScreenshots() {
  saveScreenshots([]);
}

export function setPendingScreenshotEdit(item: PendingScreenshotEdit) {
  localStorage.setItem(PENDING_SCREENSHOT_EDIT_KEY, JSON.stringify(item));
  window.dispatchEvent(new Event("devlauncher-pending-screenshot-edit"));
}

export function takePendingScreenshotEdit(): PendingScreenshotEdit | null {
  try {
    const raw = localStorage.getItem(PENDING_SCREENSHOT_EDIT_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_SCREENSHOT_EDIT_KEY);
    return JSON.parse(raw) as PendingScreenshotEdit;
  } catch {
    localStorage.removeItem(PENDING_SCREENSHOT_EDIT_KEY);
    return null;
  }
}

export function addScreenshot(item: Omit<StoredScreenshot, "id" | "createdAt" | "title"> & { title?: string }) {
  const createdAt = Date.now();
  const saved: StoredScreenshot = {
    ...item,
    id: `${createdAt.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    title: item.title || new Date(createdAt).toLocaleString(),
  };
  saveScreenshots([saved, ...loadScreenshots()]);
  return saved;
}
