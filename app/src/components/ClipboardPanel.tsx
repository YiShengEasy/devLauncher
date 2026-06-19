import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { ClipboardEntry } from "@/types/actions";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { MacWindowControls } from "@/components/MacWindowControls";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { getGlobalShortcutLabels } from "@/platform/shortcuts";
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

type TabType = "history" | "favorites";

const shellStyle: CSSProperties = {
  width: "min(940px, calc(100vw - 28px))",
  minHeight: 206,
  borderRadius: 16,
  display: "grid",
  gridTemplateColumns: "132px minmax(0, 1fr) 172px",
  gap: 12,
  padding: "14px 14px 12px",
  position: "relative",
  overflow: "visible",
  boxSizing: "border-box",
};

const utilityPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
};

const iconButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(232,234,240,0.82)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  fontSize: 13,
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
  const [activeTab, setActiveTab] = useState<TabType>("history");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const shortcutLabels = getGlobalShortcutLabels();

  const displayItems = activeTab === "history" ? items : favorites;
  const filtered = useMemo(() => filterClipboardEntries(displayItems, search), [displayItems, search]);
  const selectedEntry = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;
  const textCount = items.filter((entry) => entry.kind === "text").length;
  const imageCount = items.filter((entry) => entry.kind === "image").length;

  useEffect(() => {
    setSelectedId((current) => resolveSelectedEntryId(filtered, current));
  }, [filtered]);

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(listRef, () => {
    const children = listRef.current?.children;
    if (!children?.length) return;
    animateListEnter(Array.from(children), reducedMotion);
  }, [activeTab, search, filtered.length, items.length, favorites.length, reducedMotion]);

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
    <div ref={rootRef} className="glass motion-panel" style={shellStyle} data-tauri-drag-region>
      {selectedEntry && (
        <ClipboardPreview
          entry={selectedEntry}
          favorite={isFavoriteEntry(selectedEntry, favorites)}
          copied={copiedId === selectedEntry.id}
          onCopy={() => copyEntry(selectedEntry)}
          onToggleFavorite={() => toggleFavorite(selectedEntry)}
        />
      )}

      <section style={utilityPanelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BuiltinIcon feature="clipboard" size={18} />
          <strong style={{ fontSize: 13, color: "#e8eaf0" }}>剪切板</strong>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)" }}>
          {activeTab === "history" ? `${textCount} 文 / ${imageCount} 图` : `${favorites.length} 收藏`}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <TabButton active={activeTab === "history"} label="历史" onClick={() => { setActiveTab("history"); setSearch(""); }} />
          <TabButton active={activeTab === "favorites"} label="收藏" onClick={() => { setActiveTab("favorites"); setSearch(""); }} />
        </div>
        <div style={{ marginTop: "auto", fontSize: 10, color: "rgba(255,255,255,0.24)", lineHeight: 1.55 }}>
          点击复制<br />Esc 关闭<br />{shortcutLabels.clipboard}
        </div>
      </section>

      <section
        ref={listRef}
        className="motion-list motion-scroll-area"
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          minWidth: 0,
          overflowX: "auto",
          overflowY: "visible",
          padding: "48px 4px 10px",
        }}
        data-tauri-drag-region="false"
      >
        {filtered.length === 0 ? (
          <div style={{ width: "100%", textAlign: "center", color: "rgba(255,255,255,0.28)", fontSize: 13, paddingBottom: 42 }}>
            {activeTab === "history" ? "暂无剪贴板历史" : "暂无收藏"}
          </div>
        ) : (
          filtered.map((entry) => (
            <ClipboardCard
              key={entry.id}
              entry={entry}
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

      <section style={utilityPanelStyle} data-tauri-drag-region="false">
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button
            type="button"
            title={pinned ? "取消固定复制模式" : "固定，连续复制"}
            onClick={() => setPinned((value) => !value)}
            style={{
              ...iconButtonStyle,
              color: pinned ? "#38bdf8" : "rgba(232,234,240,0.72)",
              borderColor: pinned ? "rgba(56,189,248,0.38)" : "rgba(255,255,255,0.12)",
              background: pinned ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.07)",
            }}
          >
            {pinned ? "●" : "○"}
          </button>
          <MacWindowControls onClose={onClose} onMinimize={onClose} closeTitle="关闭剪贴板" minimizeTitle="最小化剪贴板" />
        </div>
        <input
          placeholder={activeTab === "history" ? "搜索文字..." : "搜索收藏..."}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "7px 9px",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            color: "#e8eaf0",
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
          {activeTab === "history" && items.length > 0 && (
            <DangerButton label="清空历史" confirmText="清空剪贴板历史？" onConfirm={onClear} />
          )}
          {activeTab === "favorites" && favorites.length > 0 && (
            <DangerButton label="清空收藏" confirmText="清空全部收藏？" onConfirm={onClearFavorites} />
          )}
        </div>
      </section>
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28,
        borderRadius: 8,
        border: `1px solid ${active ? "rgba(56,189,248,0.36)" : "rgba(255,255,255,0.1)"}`,
        background: active ? "rgba(56,189,248,0.16)" : "rgba(255,255,255,0.055)",
        color: active ? "#e8eaf0" : "rgba(255,255,255,0.45)",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function DangerButton({ label, confirmText, onConfirm }: { label: string; confirmText: string; onConfirm: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(confirmText)) onConfirm();
      }}
      style={{
        fontSize: 10,
        padding: "4px 8px",
        borderRadius: 7,
        cursor: "pointer",
        border: "1px solid rgba(239,68,68,0.28)",
        background: "rgba(239,68,68,0.10)",
        color: "rgba(248,113,113,0.86)",
      }}
    >
      {label}
    </button>
  );
}

function ClipboardCard({
  entry,
  selected,
  favorite,
  copied,
  reducedMotion,
  onSelect,
  onCopy,
  onToggleFavorite,
}: {
  entry: ClipboardEntry;
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
        width: selected ? 154 : 128,
        height: selected ? 104 : 78,
        flex: "0 0 auto",
        borderRadius: 10,
        border: `1px solid ${selected ? "rgba(56,189,248,0.44)" : favorite ? "rgba(250,204,21,0.28)" : "rgba(255,255,255,0.10)"}`,
        background: copied ? "rgba(56,189,248,0.20)" : selected ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.055)",
        boxShadow: selected ? "0 16px 36px rgba(0,0,0,0.38)" : "0 8px 18px rgba(0,0,0,0.20)",
        color: "rgba(232,234,240,0.88)",
        cursor: "pointer",
        padding: 9,
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        transform: selected && !reducedMotion ? "translateY(-13px) scale(1.04)" : "translateY(0) scale(1)",
        transition: reducedMotion
          ? "background-color 120ms ease, border-color 120ms ease"
          : "width 180ms ease, height 180ms ease, transform 190ms ease, background-color 140ms ease, border-color 140ms ease, box-shadow 190ms ease",
        boxSizing: "border-box",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 12, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {copied ? "已复制" : clipboardEntryTitle(entry)}
        </strong>
        <button
          type="button"
          title={favorite ? "取消收藏" : "加入收藏"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          style={{
            border: "none",
            background: "transparent",
            color: favorite ? "#facc15" : "rgba(255,255,255,0.28)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
        >
          {favorite ? "★" : "☆"}
        </button>
      </span>
      {entry.kind === "image" ? (
        <img
          src={`data:image/jpeg;base64,${entry.data}`}
          alt=""
          draggable={false}
          style={{ flex: 1, minHeight: 0, width: "100%", objectFit: "cover", borderRadius: 7, background: "rgba(255,255,255,0.08)" }}
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      ) : (
        <span style={{ fontSize: 11, lineHeight: 1.35, color: "rgba(255,255,255,0.58)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: selected ? 3 : 2, WebkitBoxOrient: "vertical", whiteSpace: "pre-wrap" }}>
          {clipboardEntryPreview(entry, selected ? 130 : 72)}
        </span>
      )}
      <span style={{ marginTop: "auto", fontSize: 10, color: "rgba(255,255,255,0.34)" }}>{clipboardEntryMeta(entry)}</span>
    </div>
  );
}

function ClipboardPreview({
  entry,
  favorite,
  copied,
  onCopy,
  onToggleFavorite,
}: {
  entry: ClipboardEntry;
  favorite: boolean;
  copied: boolean;
  onCopy: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      data-tauri-drag-region="false"
      style={{
        position: "absolute",
        left: "50%",
        bottom: "calc(100% - 46px)",
        transform: "translateX(-50%)",
        width: "min(520px, calc(100% - 220px))",
        maxHeight: 210,
        borderRadius: 14,
        padding: 12,
        background: "rgba(15,23,42,0.94)",
        border: "1px solid rgba(56,189,248,0.28)",
        boxShadow: "0 22px 56px rgba(0,0,0,0.45)",
        color: "rgba(232,234,240,0.88)",
        zIndex: 4,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <strong style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clipboardEntryTitle(entry)}</strong>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button type="button" title={favorite ? "取消收藏" : "加入收藏"} onClick={onToggleFavorite} style={iconButtonStyle}>{favorite ? "★" : "☆"}</button>
          <button type="button" title="复制" onClick={onCopy} style={{ ...iconButtonStyle, width: 54 }}>{copied ? "已复制" : "复制"}</button>
        </div>
      </div>
      {entry.kind === "image" ? (
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, alignItems: "center" }}>
          <img src={`data:image/jpeg;base64,${entry.data}`} alt="clipboard image" style={{ width: 150, maxHeight: 128, objectFit: "contain", borderRadius: 9, background: "rgba(255,255,255,0.08)" }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.56)" }}>{entry.width}x{entry.height}<br />点击复制图片</span>
        </div>
      ) : (
        <pre style={{ margin: 0, maxHeight: 142, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 11, lineHeight: 1.55, color: "rgba(255,255,255,0.68)" }}>
          {entry.content}
        </pre>
      )}
    </div>
  );
}
