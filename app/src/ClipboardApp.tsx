import { useEffect, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipboardPanel } from "@/components/ClipboardPanel";
import type { ClipboardEntry } from "@/types/actions";

export function ClipboardApp() {
  const [items, setItems] = useState<ClipboardEntry[]>([]);
  const [favorites, setFavorites] = useState<ClipboardEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const hist = await invoke<ClipboardEntry[]>("get_clipboard_history");
      setItems(hist);
    } catch {
      setItems([]);
    }
  }, []);

  const refreshFavorites = useCallback(async () => {
    try {
      const favs = await invoke<ClipboardEntry[]>("get_clipboard_favorites");
      setFavorites(favs);
    } catch {
      setFavorites([]);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    refresh();
    refreshFavorites();
  }, [refresh, refreshFavorites]);

  // Refresh when window is shown
  useEffect(() => {
    const unlisten = listen("clipboard-refresh", () => {
      refresh();
      refreshFavorites();
    });
    return () => {
      unlisten.then(fn => fn());
    };
  }, [refresh, refreshFavorites]);

  // Esc to hide window
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        getCurrentWindow().hide().catch(() => {});
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCopyText = async (text: string) => {
    try {
      await invoke("set_clipboard_text", { text });
    } catch (e) {
      console.error(e);
    }
    getCurrentWindow().hide().catch(() => {});
  };

  const handleCopyImage = async (data: string) => {
    try {
      await invoke("set_clipboard_image", { data });
    } catch (e) {
      console.error(e);
    }
    getCurrentWindow().hide().catch(() => {});
  };

  const handleClear = async () => {
    await invoke("clear_clipboard_history");
    setItems([]);
  };

  const handleToggleFavorite = async (entry: ClipboardEntry) => {
    const isFav = favorites.some(f => {
      if (f.kind === "text" && entry.kind === "text") return f.id === entry.id;
      if (f.kind === "image" && entry.kind === "image") return f.id === entry.id;
      return false;
    });
    if (isFav) {
      await invoke("remove_favorite", { id: entry.id });
    } else {
      await invoke("add_favorite", { entry });
    }
    refreshFavorites();
  };

  const handleRemoveFavorite = async (id: string) => {
    await invoke("remove_favorite", { id });
    refreshFavorites();
  };

  const handleClearFavorites = async () => {
    await invoke("clear_favorites");
    setFavorites([]);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <ClipboardPanel
        items={items}
        favorites={favorites}
        onCopyText={handleCopyText}
        onCopyImage={handleCopyImage}
        onClear={handleClear}
        onClose={() => getCurrentWindow().hide().catch(() => {})}
        onToggleFavorite={handleToggleFavorite}
        onRemoveFavorite={handleRemoveFavorite}
        onClearFavorites={handleClearFavorites}
      />
    </div>
  );
}
