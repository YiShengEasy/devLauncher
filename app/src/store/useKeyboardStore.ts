import { create } from "zustand";
import type { KeyboardConfig, Page, KeyId, Action, ThemeConfig } from "@/types/actions";
import { DEFAULT_THEME } from "@/types/actions";

interface KeyboardState {
  config: KeyboardConfig | null;
  activePageIndex: number;
  loading: boolean;
  error: string | null;
  appIcons: Record<string, string>; // exe_path → base64 PNG data URL
  favicons: Record<string, string>;
  showSettings: boolean;

  // Derived
  activePage: Page | null;
  theme: ThemeConfig;

  // Actions
  setConfig: (config: KeyboardConfig) => void;
  setActivePageIndex: (index: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAppIcons: (icons: Record<string, string>) => void;
  bindKey: (pageIndex: number, keyId: KeyId, action: Action | null) => void;
  swapKeys: (pageIndex: number, fromKey: KeyId, toKey: KeyId) => void;
  addPage: (name: string) => void;
  renamePage: (index: number, name: string) => void;
  removePage: (index: number) => void;
  setFavicons: (icons: Record<string, string>) => void;
  setShowSettings: (show: boolean) => void;
  setTheme: (theme: Partial<ThemeConfig>) => void;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  config: null,
  activePageIndex: 0,
  loading: false,
  error: null,
  appIcons: {},
  favicons: {},
  showSettings: false,
  theme: DEFAULT_THEME,

  get activePage() {
    const { config, activePageIndex } = get();
    return config?.pages[activePageIndex] ?? null;
  },
  // theme is a direct property — do NOT use a getter here (Zustand Object.assign loses getters)

  setConfig: (config) => set({ config, activePageIndex: 0, theme: config.theme ?? DEFAULT_THEME }),
  setActivePageIndex: (index) => set({ activePageIndex: index }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setAppIcons: (icons) => set({ appIcons: icons }),
  setFavicons: (icons) => set((state) => ({ favicons: { ...state.favicons, ...icons } })),
  setShowSettings: (show) => set({ showSettings: show }),

  bindKey: (pageIndex, keyId, action) =>
    set((state) => {
      if (!state.config) return state;
      const pages = [...state.config.pages];
      const page = { ...pages[pageIndex] };
      page.keys = { ...page.keys, [keyId]: { action } };
      pages[pageIndex] = page;
      return { config: { ...state.config, pages } };
    }),

  swapKeys: (pageIndex, fromKey, toKey) =>
    set((state) => {
      if (!state.config) return state;
      const pages = [...state.config.pages];
      const page = { ...pages[pageIndex] };
      const keys = { ...page.keys };
      const tmp = keys[fromKey];
      keys[fromKey] = keys[toKey] ?? { action: null };
      keys[toKey] = tmp ?? { action: null };
      page.keys = keys;
      pages[pageIndex] = page;
      return { config: { ...state.config, pages } };
    }),

  addPage: (name) =>
    set((state) => {
      if (!state.config) return state;
      const pages = [...state.config.pages, { name, keys: {} }];
      return { config: { ...state.config, pages }, activePageIndex: pages.length - 1 };
    }),

  renamePage: (index, name) =>
    set((state) => {
      if (!state.config) return state;
      const pages = [...state.config.pages];
      pages[index] = { ...pages[index], name };
      return { config: { ...state.config, pages } };
    }),

  removePage: (index) =>
    set((state) => {
      if (!state.config || state.config.pages.length <= 1) return state;
      const pages = state.config.pages.filter((_, i) => i !== index);
      const cur = state.activePageIndex;
      const newActive = cur >= pages.length ? pages.length - 1 : cur > index ? cur - 1 : cur === index ? Math.max(0, index - 1) : cur;
      return { config: { ...state.config, pages }, activePageIndex: newActive };
    }),

  setTheme: (partial) =>
    set((state) => {
      if (!state.config) return state;
      const current = state.config.theme ?? DEFAULT_THEME;
      const newTheme = { ...current, ...partial };
      return {
        // Update both the direct `theme` property (for selectors/re-renders)
        // AND config.theme (for persistence)
        theme: newTheme,
        config: {
          ...state.config,
          theme: newTheme,
        },
      };
    }),
}));
