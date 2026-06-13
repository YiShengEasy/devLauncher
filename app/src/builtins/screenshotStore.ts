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
