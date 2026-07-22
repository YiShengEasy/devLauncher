export const PROJECT_CONFIG_FAVORITES_STORAGE_KEY = "devlauncher.projectconfigs.favorites";
export const MAX_PROJECT_CONFIG_FAVORITES = 200;

export interface FavoriteConfigRef {
  root: string;
  path: string;
}

function normalizeFavorite(value: unknown): FavoriteConfigRef | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FavoriteConfigRef>;
  const root = typeof candidate.root === "string" ? candidate.root.trim() : "";
  const path = typeof candidate.path === "string" ? candidate.path.trim() : "";
  return root && path ? { root, path } : null;
}

export function favoriteConfigKey(config: FavoriteConfigRef): string {
  return `${config.root}\u0000${config.path}`;
}

export function parseConfigFavorites(raw: string | null): FavoriteConfigRef[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, FavoriteConfigRef>();
    for (const value of parsed) {
      const favorite = normalizeFavorite(value);
      if (favorite && !unique.has(favoriteConfigKey(favorite))) {
        unique.set(favoriteConfigKey(favorite), favorite);
      }
    }
    return [...unique.values()].slice(0, MAX_PROJECT_CONFIG_FAVORITES);
  } catch {
    return [];
  }
}

export function isConfigFavorite(
  favorites: FavoriteConfigRef[],
  config: FavoriteConfigRef,
): boolean {
  const key = favoriteConfigKey(config);
  return favorites.some((favorite) => favoriteConfigKey(favorite) === key);
}

export function toggleConfigFavorite(
  favorites: FavoriteConfigRef[],
  config: FavoriteConfigRef,
): FavoriteConfigRef[] {
  const normalized = normalizeFavorite(config);
  if (!normalized) return favorites;
  const key = favoriteConfigKey(normalized);
  if (favorites.some((favorite) => favoriteConfigKey(favorite) === key)) {
    return favorites.filter((favorite) => favoriteConfigKey(favorite) !== key);
  }
  return [normalized, ...favorites].slice(0, MAX_PROJECT_CONFIG_FAVORITES);
}

export function sortConfigsByFavorite<T extends { path: string }>(
  configs: T[],
  root: string,
  favorites: FavoriteConfigRef[],
): T[] {
  return configs
    .map((config, index) => ({
      config,
      index,
      favorite: isConfigFavorite(favorites, { root, path: config.path }),
    }))
    .sort((left, right) => Number(right.favorite) - Number(left.favorite) || left.index - right.index)
    .map(({ config }) => config);
}
