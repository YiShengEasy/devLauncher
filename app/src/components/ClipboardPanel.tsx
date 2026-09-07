import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ClipboardEntry } from "@/types/actions";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { WindowPinButton } from "@/components/WindowPinButton";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { getWindowPinState, WINDOW_PIN_CHANGED_EVENT, type WindowPinState } from "@/windowPinning";
import {
  clipboardEntryMeta,
  clipboardEntryPreview,
  clipboardEntryTitle,
  filterClipboardEntries,
  isFavoriteEntry,
  markdownFilename,
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
  onSaveMarkdown: (content: string, defaultFilename: string) => Promise<"saved" | "cancelled">;
}

type FilterType = "all" | "text" | "image" | "favorites";
type TextView = "source" | "markdown";
type TextClipboardEntry = Extract<ClipboardEntry, { kind: "text" }>;

const shellStyle: CSSProperties = {
  width: "100vw",
  height: "100%",
  borderRadius: "24px 24px 0 0",
  display: "grid",
  gridTemplateRows: "40px minmax(0, 1fr) 22px",
  padding: "14px 18px 12px",
  position: "relative",
  overflow: "hidden",
  boxSizing: "border-box",
  background:
    "radial-gradient(circle at 34% 82%, rgba(35,126,112,0.22), transparent 28%), radial-gradient(circle at 76% 74%, rgba(37,72,132,0.18), transparent 30%), var(--theme-bg, rgba(22,24,30,0.76))",
  border: "1px solid var(--theme-border, rgba(180,195,225,0.36))",
  boxShadow: "var(--theme-window-shadow, 0 -2px 8px rgba(0,0,0,0.10)), inset 0 1px 0 rgba(255,255,255,0.18)",
  backdropFilter: "blur(var(--theme-blur, 34px)) saturate(165%)",
  WebkitBackdropFilter: "blur(var(--theme-blur, 34px)) saturate(165%)",
};

const iconButtonStyle: CSSProperties = {
  minWidth: 46,
  height: 28,
  borderRadius: 9,
  border: "1px solid transparent",
  background: "transparent",
  color: "rgba(232,234,240,0.56)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  padding: "0 12px",
  whiteSpace: "nowrap",
};

const scrollButtonStyle: CSSProperties = {
  width: 32,
  height: 22,
  padding: 0,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(245,247,252,0.72)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  boxSizing: "border-box",
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
  onSaveMarkdown,
}: ClipboardPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [textView, setTextView] = useState<TextView>("source");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [expandedMarkdown, setExpandedMarkdown] = useState<TextClipboardEntry | null>(null);
  const [markdownCopyState, setMarkdownCopyState] = useState<"idle" | "all">("idle");
  const windowLabel = getCurrentWindow().label;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();

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

  const updateScrollProgress = useCallback(() => {
    const scroller = listRef.current;
    if (!scroller) return;
    const maxScroll = Math.max(1, scroller.scrollWidth - scroller.clientWidth);
    setScrollProgress(Math.min(1, Math.max(0, scroller.scrollLeft / maxScroll)));
  }, []);

  const scrollCards = (direction: "prev" | "next") => {
    const scroller = listRef.current;
    if (!scroller) return;
    const firstCard = scroller.querySelector<HTMLElement>("[data-clipboard-card]");
    const step = firstCard ? firstCard.getBoundingClientRect().width + 16 : 376;
    scroller.scrollBy({ left: direction === "next" ? step : -step, behavior: reducedMotion ? "auto" : "smooth" });
    window.setTimeout(updateScrollProgress, reducedMotion ? 0 : 220);
  };

  useEffect(() => {
    setSelectedId((current) => resolveSelectedEntryId(filtered, current));
  }, [filtered]);

  useEffect(() => {
    if (filter !== "favorites") return;
    setSelectedId((current) => resolveSelectedEntryId(filtered, current));
  }, [filter, filtered]);

  useEffect(() => {
    updateScrollProgress();
  }, [filtered.length, updateScrollProgress]);

  useEffect(() => {
    if (!expandedMarkdown) return;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setExpandedMarkdown(null);
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => {
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [expandedMarkdown]);

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

  useEffect(() => {
    let cancelled = false;
    getWindowPinState(windowLabel)
      .then((state) => {
        if (!cancelled) setPinned(state.pinned);
      })
      .catch(() => {});

    let unlisten: (() => void) | null = null;
    listen<WindowPinState>(WINDOW_PIN_CHANGED_EVENT, (event) => {
      if (event.payload.label === windowLabel) {
        setPinned(event.payload.pinned);
      }
    })
      .then((nextUnlisten) => {
        unlisten = nextUnlisten;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [windowLabel]);

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

  const saveSelectedMarkdown = async () => {
    if (!selectedEntry || selectedEntry.kind !== "text" || saveState === "saving") return;
    setSaveState("saving");
    try {
      const result = await onSaveMarkdown(selectedEntry.content, markdownFilename(selectedEntry));
      setSaveState(result === "saved" ? "saved" : "idle");
      if (result === "saved") {
        window.setTimeout(() => setSaveState("idle"), 1600);
      }
    } catch (error) {
      console.error("save clipboard markdown failed", error);
      setSaveState("error");
      window.setTimeout(() => setSaveState("idle"), 1800);
    }
  };

  const copyExpandedMarkdown = () => {
    if (!expandedMarkdown) return;
    onCopyText(expandedMarkdown.content, { keepOpen: true });
    setMarkdownCopyState("all");
    window.setTimeout(() => setMarkdownCopyState("idle"), 1200);
  };

  return (
    <div ref={rootRef} className="motion-panel theme-window-surface" style={shellStyle} data-tauri-drag-region>
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "36px minmax(480px, 680px) minmax(280px, 1fr)",
          gap: 10,
          alignItems: "center",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0 }}>
          <BuiltinIcon feature="clipboard" size={27} title="剪贴板历史" />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minWidth: 0 }} data-tauri-drag-region="false">
          <label
            style={{
              height: 32,
              minWidth: 260,
              maxWidth: 300,
              flex: "0 1 300px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              borderRadius: 9,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.09)",
              color: "rgba(232,234,240,0.46)",
              boxSizing: "border-box",
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>⌕</span>
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
                fontSize: 12,
                fontWeight: 600,
              }}
            />
          </label>

          <nav style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <FilterButton active={filter === "all"} label="全部" count={items.length} onClick={() => setFilter("all")} />
            <FilterButton active={filter === "text"} label="文本" count={textCount} onClick={() => setFilter("text")} />
            <FilterButton active={filter === "image"} label="图片" count={imageCount} onClick={() => setFilter("image")} />
            <FilterButton active={false} label="文件" count={fileCount} onClick={() => setFilter("all")} disabled />
            <FilterButton active={filter === "favorites"} label="收藏" count={favorites.length} onClick={() => setFilter("favorites")} />
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, minWidth: 0, paddingRight: 4 }} data-tauri-drag-region="false">
          <div
            style={{
              height: 28,
              display: "flex",
              alignItems: "center",
              padding: 2,
              borderRadius: 9,
              border: "1px solid rgba(255,255,255,0.13)",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            <TextViewButton active={textView === "source"} label="原文" onClick={() => setTextView("source")} />
            <TextViewButton active={textView === "markdown"} label="Markdown" onClick={() => setTextView("markdown")} />
          </div>
          <button
            type="button"
            title={selectedEntry?.kind === "text" ? "将当前文本保存为 Markdown 文件" : "请选择一条文本记录"}
            disabled={selectedEntry?.kind !== "text" || saveState === "saving"}
            onClick={saveSelectedMarkdown}
            style={{
              ...iconButtonStyle,
              minWidth: 76,
              border: "1px solid rgba(116,166,255,0.22)",
              background: selectedEntry?.kind === "text" ? "rgba(78,122,195,0.13)" : "transparent",
              color: selectedEntry?.kind === "text" ? "rgba(220,232,255,0.88)" : "rgba(232,234,240,0.28)",
              cursor: selectedEntry?.kind === "text" && saveState !== "saving" ? "pointer" : "default",
            }}
          >
            {saveState === "saving" ? "保存中…" : "保存 .md"}
          </button>
          <button
            type="button"
            title={filter === "favorites" ? "清空收藏" : "清空历史"}
            onClick={async () => {
              if (filter === "favorites") {
                if (favorites.length === 0) return;
                const confirmed = await confirmAction({
                  title: "清空全部收藏",
                  message: "将移除全部收藏项目。剪贴板历史中的原始内容不会被删除。",
                  confirmLabel: "清空收藏",
                });
                if (confirmed) onClearFavorites();
                return;
              }
              if (items.length === 0) return;
              const confirmed = await confirmAction({
                title: "清空剪贴板历史",
                message: "将删除全部剪贴板历史记录，已收藏的项目仍会保留。",
                confirmLabel: "清空历史",
              });
              if (confirmed) onClear();
            }}
            style={iconButtonStyle}
          >
            清空
          </button>
          <WindowPinButton />
        </div>
      </header>

      <section
        ref={listRef}
        className="motion-list motion-scroll-area"
        style={{
          display: "flex",
          gap: 16,
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          padding: "14px 0 0",
          alignItems: "stretch",
          boxSizing: "border-box",
        }}
        onScroll={updateScrollProgress}
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
              renderMarkdown={textView === "markdown"}
              onExpandMarkdown={
                entry.kind === "text"
                  ? () => {
                      setExpandedMarkdown(entry);
                      setMarkdownCopyState("idle");
                    }
                  : undefined
              }
              onSelect={() => setSelectedId(entry.id)}
              onCopy={() => copyEntry(entry)}
              onToggleFavorite={() => toggleFavorite(entry)}
            />
          ))
        )}
      </section>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, position: "relative" }} data-tauri-drag-region="false">
        <button type="button" style={scrollButtonStyle} onClick={() => scrollCards("prev")} aria-label="上一组">
          <ChevronIcon direction="left" />
        </button>
        <div
          style={{
            width: 150,
            height: 3,
            borderRadius: 999,
            background: "rgba(255,255,255,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.max(12, Math.min(100, 12 + scrollProgress * 88))}%`,
              height: "100%",
              borderRadius: 999,
              background: "linear-gradient(90deg, rgba(91,141,255,0.95), rgba(61,216,255,0.80))",
              transition: reducedMotion ? "none" : "width 160ms ease",
            }}
          />
        </div>
        <button type="button" style={scrollButtonStyle} onClick={() => scrollCards("next")} aria-label="下一组">
          <ChevronIcon direction="right" />
        </button>
        {saveState !== "idle" && saveState !== "saving" && (
          <span
            role="status"
            style={{
              position: "absolute",
              right: 6,
              fontSize: 11,
              fontWeight: 700,
              color: saveState === "saved" ? "#a7f3d0" : "#fecaca",
            }}
          >
            {saveState === "saved" ? "Markdown 已保存" : "保存失败"}
          </span>
        )}
      </div>
      {expandedMarkdown && (
        <MarkdownExpandedDialog
          entry={expandedMarkdown}
          copyState={markdownCopyState}
          onCopyAll={copyExpandedMarkdown}
          onClose={() => setExpandedMarkdown(null)}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function MarkdownExpandedDialog({
  entry,
  copyState,
  onCopyAll,
  onClose,
}: {
  entry: TextClipboardEntry;
  copyState: "idle" | "all";
  onCopyAll: () => void;
  onClose: () => void;
}) {
  const actionStyle: CSSProperties = {
    height: 30,
    padding: "0 12px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "rgba(242,246,255,0.86)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Markdown 放大预览"
      data-tauri-drag-region="false"
      style={{
        position: "absolute",
        inset: 10,
        zIndex: 100,
        display: "grid",
        gridTemplateRows: "48px minmax(0, 1fr) 32px",
        padding: "0 18px 14px",
        borderRadius: 18,
        overflow: "hidden",
        boxSizing: "border-box",
        background: "linear-gradient(145deg, rgba(24,31,43,0.98), rgba(15,21,33,0.98))",
        border: "1px solid rgba(177,199,235,0.30)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.10)",
        backdropFilter: "blur(30px)",
        WebkitBackdropFilter: "blur(30px)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <strong
          style={{
            minWidth: 0,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "rgba(248,250,252,0.94)",
            fontSize: 14,
          }}
        >
          {clipboardEntryTitle(entry)}
        </strong>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCopyAll}
          style={{ ...actionStyle, color: copyState === "all" ? "#a7f3d0" : actionStyle.color }}
        >
          {copyState === "all" ? "已复制全文" : "复制全文"}
        </button>
        <button
          type="button"
          aria-label="关闭 Markdown 预览"
          title="关闭（Esc）"
          onClick={onClose}
          style={{ ...actionStyle, width: 30, padding: 0, display: "grid", placeItems: "center", fontSize: 18 }}
        >
          ×
        </button>
      </header>

      <div
        style={{
          minHeight: 0,
          overflow: "hidden",
          padding: "22px 26px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.045)",
          border: "1px solid rgba(255,255,255,0.09)",
          userSelect: "text",
          WebkitUserSelect: "text",
          cursor: "text",
        }}
      >
        <MarkdownPreview content={entry.content} expanded />
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", color: "rgba(226,232,240,0.42)", fontSize: 11 }}>
        <span>像普通文本一样拖动选择，按 Cmd/Ctrl+C 复制</span>
        <span>{entry.content.length} chars</span>
      </div>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <path
        d={direction === "left" ? "M10 4.5 6 8l4 3.5" : "M6 4.5 10 8l-4 3.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TextViewButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        height: 24,
        padding: "0 9px",
        border: 0,
        borderRadius: 7,
        background: active ? "rgba(119,158,222,0.30)" : "transparent",
        color: active ? "rgba(248,250,252,0.96)" : "rgba(232,234,240,0.52)",
        fontSize: 11,
        fontWeight: 750,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

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
        height: active ? 32 : 28,
        padding: active ? "0 12px" : "0 9px",
        borderRadius: active ? 9 : 8,
        border: active ? "1px solid rgba(210,224,247,0.28)" : "1px solid transparent",
        background: active ? "rgba(255,255,255,0.15)" : "transparent",
        boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 18px rgba(0,0,0,0.18)" : "none",
        color: disabled ? "rgba(232,234,240,0.26)" : active ? "rgba(245,247,252,0.94)" : "rgba(232,234,240,0.52)",
        fontSize: 12,
        fontWeight: 700,
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
  renderMarkdown,
  onExpandMarkdown,
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
  renderMarkdown: boolean;
  onExpandMarkdown?: () => void;
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
      data-clipboard-card
      style={{
        width: 360,
        height: "100%",
        minHeight: 0,
        flex: "0 0 360px",
        borderRadius: 12,
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
        padding: 18,
        textAlign: "left",
        display: "grid",
        gridTemplateRows: "26px minmax(0, 1fr) 22px",
        gap: 14,
        transform: selected && !reducedMotion ? "translateY(-4px) scale(1.018)" : "translateY(0) scale(1)",
        transition: reducedMotion
          ? "background-color 120ms ease, border-color 120ms ease"
          : "transform 180ms ease, background 180ms ease, border-color 160ms ease, box-shadow 180ms ease",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ color: "rgba(245,247,252,0.50)", fontSize: 13, fontWeight: 700 }}>{index}</span>
          {copied && <span style={{ fontSize: 11, color: "#dbeafe", fontWeight: 700 }}>已复制</span>}
        </div>
        <button
          type="button"
          title={favorite ? "取消收藏" : "加入收藏"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          style={{
            height: 26,
            minWidth: 58,
            borderRadius: 8,
            border: favorite ? "1px solid rgba(250,204,21,0.48)" : "1px solid rgba(255,255,255,0.14)",
            background: favorite ? "rgba(250,204,21,0.10)" : "rgba(255,255,255,0.06)",
            color: favorite ? "#f4e79a" : "rgba(245,247,252,0.68)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            padding: "0 10px",
          }}
        >
          {favorite ? "已收藏" : "收藏"}
        </button>
      </div>

      {entry.kind === "image" ? (
        <div style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: 12, minHeight: 0 }}>
          <img
            src={`data:image/jpeg;base64,${entry.data}`}
            alt="clipboard image"
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              minHeight: 0,
              objectFit: "contain",
              borderRadius: 10,
              background: "rgba(255,255,255,0.08)",
            }}
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
          <strong style={{ fontSize: 16, lineHeight: 1.3 }}>{clipboardEntryTitle(entry)}</strong>
        </div>
      ) : renderMarkdown ? (
        <div style={{ minHeight: 0, overflow: "hidden", paddingTop: 2 }}>
          <MarkdownPreview content={entry.content} onOpen={onExpandMarkdown} />
        </div>
      ) : (
        <div style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-start", paddingTop: 4 }}>
          <strong
            style={{
              fontSize: 14,
              lineHeight: 1.48,
              fontWeight: 620,
              color: "rgba(248,250,252,0.92)",
              display: "-webkit-box",
              WebkitLineClamp: 16,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              whiteSpace: "pre-wrap",
            }}
          >
            {clipboardEntryPreview(entry, selected ? 260 : 220)}
          </strong>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "rgba(232,234,240,0.45)", fontSize: 12, fontWeight: 700 }}>
        <span>{entry.kind === "text" ? renderMarkdown ? "点击放大" : "最近" : "图片"}</span>
        <span>·</span>
        <span>{clipboardEntryMeta(entry)}</span>
      </div>
    </div>
  );
}
