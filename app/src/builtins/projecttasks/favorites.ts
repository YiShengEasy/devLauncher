export const PROJECT_TASK_FAVORITES_STORAGE_KEY = "devlauncher.projecttasks.favorites";
export const MAX_PROJECT_TASK_FAVORITES = 200;

export interface FavoriteTaskRef {
  root: string;
  file: string;
  name: string;
}

function normalizeFavorite(value: unknown): FavoriteTaskRef | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FavoriteTaskRef>;
  const root = typeof candidate.root === "string" ? candidate.root.trim() : "";
  const file = typeof candidate.file === "string" ? candidate.file.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  return root && file && name ? { root, file, name } : null;
}

export function favoriteTaskKey(task: FavoriteTaskRef): string {
  return `${task.root}\u0000${task.file}\u0000${task.name}`;
}

export function parseTaskFavorites(raw: string | null): FavoriteTaskRef[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, FavoriteTaskRef>();
    for (const value of parsed) {
      const favorite = normalizeFavorite(value);
      if (favorite && !unique.has(favoriteTaskKey(favorite))) {
        unique.set(favoriteTaskKey(favorite), favorite);
      }
    }
    return [...unique.values()].slice(0, MAX_PROJECT_TASK_FAVORITES);
  } catch {
    return [];
  }
}

export function isTaskFavorite(
  favorites: FavoriteTaskRef[],
  task: FavoriteTaskRef,
): boolean {
  const key = favoriteTaskKey(task);
  return favorites.some((favorite) => favoriteTaskKey(favorite) === key);
}

export function toggleTaskFavorite(
  favorites: FavoriteTaskRef[],
  task: FavoriteTaskRef,
): FavoriteTaskRef[] {
  const normalized = normalizeFavorite(task);
  if (!normalized) return favorites;
  const key = favoriteTaskKey(normalized);
  if (favorites.some((favorite) => favoriteTaskKey(favorite) === key)) {
    return favorites.filter((favorite) => favoriteTaskKey(favorite) !== key);
  }
  return [normalized, ...favorites].slice(0, MAX_PROJECT_TASK_FAVORITES);
}
