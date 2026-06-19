import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { ClipboardEntry } from "@/types/actions";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import {
  clipboardEntryMeta,
  clipboardEntryPreview,
  clipboardEntryTitle,
  filterClipboardEntries,
  isFavoriteEntry,
  resolveSelectedEntryId,
} from "./clipboardPanelModel";

interface ClipboardPanelProps {
  items: ClipboardEntry[];
  favorites: ClipboardEntry[];
  onCopyText: (text: string, options?: { keepOpen?: boolean }) => void;
  onCopyImage: (data: string, options?: { keepOpen?: boolean }) => void;
  onClear: () => void;
  onClose: () => void;
  onToggleFavorite: (entry: ClipboardEntry) => void;
  onRemoveFavorite: (id: string) => void;
  onClearFavorites: () => void;
}

type FilterType = "all" | "text" | "image" | "favorites";

const shellStyle: CSSProperties = {
  width: "100vw",
  height: "100%",
  borderRadius: "24px 24px 0 0",
  display: "grid",
  gridTemplateRows: "82px minmax(0, 1fr)",
  padding: "24px 16px 36px",
  position: "relative",
  overflow: "hidden",
  boxSizing: "border-box",
  background:
    "radial-gradient(circle at 34% 82%, rgba(35,126,112,0.34), transparent 28%), radial-gradient(circle at 76% 74%, rgba(37,72,132,0.26), transparent 30%), rgba(22,24,30,0.76)",
  border: "1px solid rgba(180,195,225,0.36)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 -18px 48px rgba(0,0,0,0.34)",
  backdropFilter: "blur(34px) saturate(165%)",
  WebkitBackdropFilter: "blur(34px) saturate(165%)",
};

const iconButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(232,234,240,0.72)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  fontSize: 18,
  lineHeight: 1,
};

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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const textCount = items.filter((entry) => entry.kind === "text").length;
  const imageCount = items.filter((entry) => entry.kind === "image").length;
  const fileCount = 0;
  const displayItems = filter === "favorites" ? favorites : items;

  const typedItems = useMemo(() => {
    if (filter === "text") return displayItems.filter((entry) => entry.kind === "text");
    if (filter === "image") return displayItems.filter((entry) => entry.kind === "image");
    return displayItems;
  }, [displayItems, filter]);

  const filtered = useMemo(() => filterClipboardEntries(typedItems, search), [typedItems, search]);
  const selectedEntry = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    setSelectedId((current) => resolveSelectedEntryId(filtered, current));
  }, [filtered]);

  useEffect(() => {
    if (filter !== "favorites") return;
    setSelectedId((current) => resolveSelectedEntryId(filtered, current));
  }, [filter, filtered]);

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(listRef, () => {
    const children = listRef.current?.children;
    if (!children?.length) return;
    animateListEnter(Array.from(children), reducedMotion);
  }, [filter, search, filtered.length, items.length, favorites.length, reducedMotion]);

  useEffect(() => {
    const handleBlur = () => {
      if (!pinned) onClose();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [onClose, pinned]);

  const copyEntry = (entry: ClipboardEntry) => {
    setCopiedId(entry.id);
    window.setTimeout(() => setCopiedId(null), 950);
    if (entry.kind === "text") {
      onCopyText(entry.content, { keepOpen: pinned });
    } else {
      onCopyImage(entry.data, { keepOpen: pinned });
    }
  };

  const toggleFavorite = (entry: ClipboardEntry) => {
    if (isFavoriteEntry(entry, favorites)) {
      onRemoveFavorite(entry.id);
    } else {
      onToggleFavorite(entry);
    }
  };

  return (
    <div ref={rootRef} className="motion-panel" style={shellStyle} data-tauri-drag-region>
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr) minmax(320px, 760px) minmax(260px, 1fr)",
          gap: 16,
          alignItems: "center",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <BuiltinIcon feature="clipboard" size={28} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <strong style={{ fontSize: 22, color: "rgba(245,247,252,0.92)", whiteSpace: "nowrap" }}>浮光剪贴</strong>
            <span style={{ fontSize: 14, color: "rgba(232,234,240,0.42)", fontWeight: 650, whiteSpace: "nowrap" }}>
              最近1000次，收藏永久保留
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, minWidth: 0 }} data-tauri-drag-region="false">
          <label
            style={{
              height: 46,
              minWidth: 320,
              maxWidth: 360,
              flex: "0 1 360px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 14px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.09)",
              color: "rgba(232,234,240,0.46)",
              boxSizing: "border-box",
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>⌕</span>
            <input
              placeholder="搜索"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
              style={{
                minWidth: 0,
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "rgba(245,247,252,0.92)",
                fontSize: 16,
                fontWeight: 650,
              }}
            />
            <span style={{ fontSize: 14, opacity: 0.75 }}>⌘F</span>
          </label>

          <nav style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <FilterButton active={filter === "all"} label="全部" count={items.length} onClick={() => setFilter("all")} />
            <FilterButton active={filter === "text"} label="文本" count={textCount} onClick={() => setFilter("text")} />
            <FilterButton active={filter === "image"} label="图片" count={imageCount} onClick={() => setFilter("image")} />
            <FilterButton active={filter === "all"} label="文件" count={fileCount} onClick={() => setFilter("all")} disabled />
            <FilterButton active={filter === "favorites"} label="收藏" count={favorites.length} onClick={() => setFilter("favorites")} />
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 18 }} data-tauri-drag-region="false">
          <button
            type="button"
            title={filter === "favorites" ? "清空收藏" : "清空历史"}
            onClick={() => {
              if (filter === "favorites") {
                if (favorites.length > 0 && window.confirm("清空全部收藏？")) onClearFavorites();
                return;
              }
              if (items.length > 0 && window.confirm("清空剪贴板历史？")) onClear();
            }}
            style={iconButtonStyle}
          >
            ⌫
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(232,234,240,0.66)", fontSize: 16, fontWeight: 700 }}>
            <span>粘贴</span>
            <button type="button" style={{ ...modeButtonStyle, background: "rgba(255,255,255,0.13)", color: "#f4f7fb" }}>单击</button>
            <button type="button" style={modeButtonStyle}>双击</button>
          </div>
          <button
            type="button"
            title={pinned ? "取消固定，复制后关闭" : "固定，连续复制"}
            onClick={() => setPinned((value) => !value)}
            style={{
              ...iconButtonStyle,
              color: pinned ? "#d8e6ff" : "rgba(232,234,240,0.70)",
              borderColor: pinned ? "rgba(147,197,253,0.55)" : "rgba(255,255,255,0.10)",
              background: pinned ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.06)",
            }}
          >
            {pinned ? "▣" : "□"}
          </button>
          <button type="button" title="关闭剪贴板" onClick={onClose} style={iconButtonStyle}>×</button>
        </div>
      </header>

      <section
        ref={listRef}
        className="motion-list motion-scroll-area"
        style={{
          display: "flex",
          gap: 18,
          minWidth: 0,
          overflowX: "auto",
          overflowY: "hidden",
          padding: "34px 0 0",
          alignItems: "stretch",
        }}
        data-tauri-drag-region="false"
      >
        {filtered.length === 0 ? (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.35)", fontSize: 16 }}>
            {filter === "favorites" ? "暂无收藏" : "暂无剪贴板历史"}
          </div>
        ) : (
          filtered.map((entry, index) => (
            <ClipboardCard
              key={entry.id}
              entry={entry}
              index={index + 1}
              selected={selectedEntry?.id === entry.id}
              favorite={isFavoriteEntry(entry, favorites)}
              copied={copiedId === entry.id}
              reducedMotion={reducedMotion}
              onSelect={() => setSelectedId(entry.id)}
              onCopy={() => copyEntry(entry)}
              onToggleFavorite={() => toggleFavorite(entry)}
            />
          ))
        )}
      </section>
    </div>
  );
}

const modeButtonStyle: CSSProperties = {
  height: 34,
  minWidth: 50,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(232,234,240,0.46)",
  fontSize: 15,
  fontWeight: 750,
  cursor: "default",
};

function FilterButton({
  active,
  label,
  count,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: active ? 44 : 34,
        padding: active ? "0 18px" : "0 8px",
        borderRadius: active ? 12 : 10,
        border: active ? "1px solid rgba(210,224,247,0.28)" : "1px solid transparent",
        background: active ? "rgba(255,255,255,0.15)" : "transparent",
        boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 18px rgba(0,0,0,0.18)" : "none",
        color: disabled ? "rgba(232,234,240,0.26)" : active ? "rgba(245,247,252,0.94)" : "rgba(232,234,240,0.52)",
        fontSize: 17,
        fontWeight: 800,
        cursor: disabled ? "default" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label} {count}
    </button>
  );
}

function ClipboardCard({
  entry,
  index,
  selected,
  favorite,
  copied,
  reducedMotion,
  onSelect,
  onCopy,
  onToggleFavorite,
}: {
  entry: ClipboardEntry;
  index: number;
  selected: boolean;
  favorite: boolean;
  copied: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onToggleFavorite: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCopy();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onCopy}
      onKeyDown={handleKeyDown}
      style={{
        width: 394,
        height: "100%",
        minHeight: 338,
        flex: "0 0 394px",
        borderRadius: 16,
        border: `1px solid ${selected ? "rgba(86,143,255,0.96)" : favorite ? "rgba(250,204,21,0.30)" : "rgba(255,255,255,0.12)"}`,
        background: copied
          ? "linear-gradient(135deg, rgba(74,126,192,0.42), rgba(126,125,178,0.48))"
          : selected
            ? "linear-gradient(135deg, rgba(112,139,189,0.82), rgba(139,133,174,0.82))"
            : "rgba(255,255,255,0.075)",
        boxShadow: selected
          ? "0 18px 38px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.17)"
          : "0 10px 26px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.08)",
        color: "rgba(245,247,252,0.90)",
        cursor: "pointer",
        padding: 24,
        textAlign: "left",
        display: "grid",
        gridTemplateRows: "28px minmax(0, 1fr) 26px",
        gap: 18,
        transform: selected && !reducedMotion ? "translateY(-4px) scale(1.018)" : "translateY(0) scale(1)",
        transition: reducedMotion
          ? "background-color 120ms ease, border-color 120ms ease"
          : "transform 180ms ease, background 180ms ease, border-color 160ms ease, box-shadow 180ms ease",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span style={{ color: "rgba(245,247,252,0.50)", fontSize: 16, fontWeight: 750 }}>{index}</span>
          <button
            type="button"
            title={favorite ? "取消收藏" : "加入收藏"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            style={{
              width: 24,
              height: 24,
              border: "none",
              borderRadius: 7,
              background: selected ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
              color: favorite ? "#facc15" : "rgba(255,255,255,0.46)",
              cursor: "pointer",
              lineHeight: 1,
              padding: 0,
            }}
          >
            {favorite ? "★" : "◆"}
          </button>
        </div>
        {copied && <span style={{ fontSize: 13, color: "#dbeafe", fontWeight: 800 }}>已复制</span>}
      </div>

      {entry.kind === "image" ? (
        <div style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: 14, minHeight: 0 }}>
          <img
            src={`data:image/jpeg;base64,${entry.data}`}
            alt="clipboard image"
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 0,
              objectFit: "contain",
              borderRadius: 12,
              background: "rgba(255,255,255,0.08)",
            }}
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
          <strong style={{ fontSize: 24, lineHeight: 1.25 }}>{clipboardEntryTitle(entry)}</strong>
        </div>
      ) : (
        <div style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <strong
            style={{
              fontSize: 22,
              lineHeight: 1.4,
              fontWeight: 850,
              color: "rgba(248,250,252,0.92)",
              display: "-webkit-box",
              WebkitLineClamp: 7,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              whiteSpace: "pre-wrap",
            }}
          >
            {clipboardEntryPreview(entry, selected ? 260 : 220)}
          </strong>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(232,234,240,0.45)", fontSize: 15, fontWeight: 800 }}>
        <span>{entry.kind === "text" ? "最近" : "图片"}</span>
        <span>·</span>
        <span>{clipboardEntryMeta(entry)}</span>
      </div>
    </div>
  );
}
