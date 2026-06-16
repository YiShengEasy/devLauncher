import { useRef, useState } from "react";
import type { ClipboardEntry } from "@/types/actions";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { MacWindowControls } from "@/components/MacWindowControls";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { getGlobalShortcutLabels } from "@/platform/shortcuts";

interface ClipboardPanelProps {
  items: ClipboardEntry[];
  favorites: ClipboardEntry[];
  onCopyText: (text: string) => void;
  onCopyImage: (data: string) => void;
  onClear: () => void;
  onClose: () => void;
  onToggleFavorite: (entry: ClipboardEntry) => void;
  onRemoveFavorite: (id: string) => void;
  onClearFavorites: () => void;
}

type TabType = "history" | "favorites";

export function ClipboardPanel({
  items,
  favorites,
  onCopyText,
  onCopyImage,
  onClear,
  onClose,
  onToggleFavorite,
  onRemoveFavorite,
  onClearFavorites,
}: ClipboardPanelProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("history");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const shortcutLabels = getGlobalShortcutLabels();

  const favoriteIds = new Set(favorites.map(f => f.id));

  const handleCopy = (entry: ClipboardEntry, index: number) => {
    if (entry.kind === "text") {
      onCopyText(entry.content);
    } else {
      onCopyImage(entry.data);
    }
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1200);
  };

  const isFav = (entry: ClipboardEntry) => favoriteIds.has(entry.id);

  const displayItems = activeTab === "history" ? items : favorites;

  const filtered = search.trim()
    ? displayItems.filter(e => {
        if (e.kind === "text") return e.content.toLowerCase().includes(search.toLowerCase());
        return true;
      })
    : displayItems;

  const textCount = items.filter(e => e.kind === "text").length;
  const imageCount = items.filter(e => e.kind === "image").length;

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(listRef, () => {
    const children = listRef.current?.children;
    if (!children?.length) return;
    animateListEnter(Array.from(children), reducedMotion);
  }, [activeTab, search, filtered.length, items.length, favorites.length, reducedMotion]);

  return (
    <div
      ref={rootRef}
      className="glass motion-panel"
      style={{
        width: 500,
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        maxHeight: 660,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        data-tauri-drag-region
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0, cursor: "move",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BuiltinIcon feature="clipboard" size={18} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e8eaf0" }}>剪切板</span>
          {activeTab === "history" && (
            <span style={{
              fontSize: 11, padding: "1px 7px",
              background: "rgba(56,189,248,0.2)", borderRadius: 10,
              color: "#38bdf8",
            }}>{textCount}文 {imageCount}图</span>
          )}
          {activeTab === "favorites" && (
            <span style={{
              fontSize: 11, padding: "1px 7px",
              background: "rgba(250,204,21,0.2)", borderRadius: 10,
              color: "#facc15",
            }}>{favorites.length}项</span>
          )}
        </div>
        <MacWindowControls onClose={onClose} onMinimize={onClose} closeTitle="关闭剪贴板" minimizeTitle="最小化剪贴板" />
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", padding: "4px 12px 0", gap: 0, flexShrink: 0,
      }}>
        <button
          onClick={() => { setActiveTab("history"); setSearch(""); }}
          style={{
            flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 500, cursor: "pointer",
            background: activeTab === "history" ? "rgba(255,255,255,0.10)" : "none",
            border: "none",
            borderBottom: activeTab === "history" ? "2px solid #38bdf8" : "2px solid transparent",
            color: activeTab === "history" ? "#e8eaf0" : "rgba(255,255,255,0.4)",
            borderRadius: "6px 6px 0 0",
            transition: "background-color 150ms ease, border-color 150ms ease, color 150ms ease",
          }}
        >历史</button>
        <button
          onClick={() => { setActiveTab("favorites"); setSearch(""); }}
          style={{
            flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 500, cursor: "pointer",
            background: activeTab === "favorites" ? "rgba(255,255,255,0.10)" : "none",
            border: "none",
            borderBottom: activeTab === "favorites" ? "2px solid #facc15" : "2px solid transparent",
            color: activeTab === "favorites" ? "#e8eaf0" : "rgba(255,255,255,0.4)",
            borderRadius: "6px 6px 0 0",
            transition: "background-color 150ms ease, border-color 150ms ease, color 150ms ease",
          }}
        >⭐ 收藏</button>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 12px", flexShrink: 0 }}>
        <input
          placeholder={activeTab === "history" ? "搜索文字..." : "搜索收藏..."}
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
          style={{
            width: "100%", padding: "6px 10px",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 7, color: "#e8eaf0", fontSize: 12, outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* List */}
      <div ref={listRef} className="motion-list motion-scroll-area" style={{ flex: 1, padding: "0 8px 6px" }}>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "32px 0",
            color: "rgba(255,255,255,0.25)", fontSize: 13,
          }}>
            {activeTab === "history" ? "暂无剪贴板历史" : "暂无收藏"}
            {activeTab === "favorites" && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", marginTop: 6 }}>
                在历史记录中点击 ⭐ 收藏项目
              </div>
            )}
          </div>
        ) : (
          filtered.map((entry, i) => {
            const isCopied = copiedIndex === i;
            const fav = isFav(entry);
            return (
              <div
                key={entry.id}
                style={{
                  padding: entry.kind === "image" ? "6px 10px" : "8px 10px",
                  borderRadius: 8,
                  marginBottom: 3,
                  background: isCopied ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isCopied ? "rgba(56,189,248,0.4)" : fav ? "rgba(250,204,21,0.20)" : "rgba(255,255,255,0.07)"}`,
                  transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease",
                  display: "flex", alignItems: "center", gap: 8,
                }}
                onMouseEnter={e => {
                  if (!isCopied) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.09)";
                }}
                onMouseLeave={e => {
                  if (!isCopied) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                }}
              >
                {/* Favorite star (left side) */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (fav) {
                      onRemoveFavorite(entry.id);
                    } else {
                      onToggleFavorite(entry);
                    }
                  }}
                  title={fav ? "取消收藏" : "加入收藏"}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 15, padding: "0 2px", lineHeight: 1,
                    color: fav ? "#facc15" : "rgba(255,255,255,0.15)",
                    transition: "color 0.15s, transform 0.15s",
                    flexShrink: 0,
                    transform: fav ? "scale(1.1)" : "scale(1)",
                  }}
                >{fav ? "★" : "☆"}</button>

                {/* Content - click to copy */}
                <div
                  onClick={() => handleCopy(entry, i)}
                  title={entry.kind === "text" ? "点击复制文字" : "点击复制图片"}
                  style={{ flex: 1, overflow: "hidden", cursor: "pointer" }}
                >
                  {entry.kind === "text" ? (
                    <span style={{
                      fontSize: 12, color: isCopied ? "#38bdf8" : "rgba(255,255,255,0.78)",
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "pre",
                      maxHeight: 38,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {entry.content.slice(0, 200)}
                    </span>
                  ) : (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, overflow: "hidden",
                    }}>
                      <img
                        src={`data:image/jpeg;base64,${entry.data}`}
                        alt="clipboard image"
                        style={{
                          maxWidth: 140, maxHeight: 90,
                          borderRadius: 4, objectFit: "contain",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      />
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                        {entry.width}×{entry.height}
                      </span>
                    </div>
                  )}
                </div>

                {/* Copy indicator */}
                <span
                  onClick={() => handleCopy(entry, i)}
                  style={{
                    fontSize: 10, flexShrink: 0,
                    color: isCopied ? "#38bdf8" : "rgba(255,255,255,0.2)",
                    transition: "color 0.12s", cursor: "pointer",
                  }}
                >
                  {isCopied ? "✓" : (entry.kind === "text" ? "复制" : "🖼")}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 12px 10px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
          点击复制 · Esc 关闭 · {shortcutLabels.clipboard} 唤起
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {activeTab === "history" && items.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("清空剪贴板历史？")) onClear();
              }}
              style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.10)",
                color: "rgba(239,68,68,0.8)",
              }}
            >清空历史</button>
          )}
          {activeTab === "favorites" && favorites.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("清空全部收藏？")) onClearFavorites();
              }}
              style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.10)",
                color: "rgba(239,68,68,0.8)",
              }}
            >清空收藏</button>
          )}
        </div>
      </div>
    </div>
  );
}
