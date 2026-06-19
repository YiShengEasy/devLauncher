# Clipboard Bottom Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the clipboard history UI as a bottom-of-screen horizontal dock with hover/selection detail preview, search, favorites, and pin-controlled copy closing.

**Architecture:** Keep the existing Tauri clipboard commands and React data ownership. Add small pure frontend helpers for filtering/formatting entries, replace the current vertical `ClipboardPanel` presentation with a bottom dock layout, and update the Rust show path so the clipboard window is wide and placed near the screen bottom before display.

**Tech Stack:** React, TypeScript, Zustand store patterns already in the app, GSAP motion helpers, Tauri v2 Rust window APIs, Vitest, Cargo tests/checks.

---

## File Structure

- Modify `app/src/components/ClipboardPanel.tsx`
  - Owns the redesigned dock presentation, pinned UI state, selected entry state, search/tab state, copy/favorite controls, and detail preview rendering.
- Create `app/src/components/clipboardPanelModel.ts`
  - Pure helper functions for display items, text titles, text previews, metadata labels, favorite checks, and selected-entry fallback. This keeps the large visual component easier to test.
- Create `app/src/components/clipboardPanelModel.test.ts`
  - Vitest coverage for filtering, image search behavior, text title/preview formatting, favorite matching, and selected-entry fallback.
- Modify `app/src/builtins/clipboard/App.tsx`
  - Keep data loading and commands, but let the panel decide whether a successful copy should close the window based on pinned state.
- Modify `app/src-tauri/src/builtins/clipboard.rs`
  - Add pure placement helper(s) and apply bottom placement in `show_clipboard_window` and `toggle_clipboard_window` before showing.
- Modify `app/src-tauri/tauri.conf.json`
  - Change the clipboard window size to a wide bottom-dock shape.

## Task 1: Clipboard Panel Model Helpers

**Files:**
- Create: `app/src/components/clipboardPanelModel.ts`
- Create: `app/src/components/clipboardPanelModel.test.ts`

- [ ] **Step 1: Write the failing model tests**

Create `app/src/components/clipboardPanelModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ClipboardEntry } from "@/types/actions";
import {
  clipboardEntryMeta,
  clipboardEntryPreview,
  clipboardEntryTitle,
  filterClipboardEntries,
  isFavoriteEntry,
  resolveSelectedEntryId,
} from "./clipboardPanelModel";

const textEntry = (id: string, content: string): ClipboardEntry => ({
  kind: "text",
  id,
  content,
});

const imageEntry = (id: string, width = 1280, height = 720): ClipboardEntry => ({
  kind: "image",
  id,
  data: "abc123",
  width,
  height,
});

describe("clipboardPanelModel", () => {
  it("filters text entries by content and keeps images visible while searching", () => {
    const entries = [
      textEntry("a", "alpha build log"),
      textEntry("b", "beta deploy note"),
      imageEntry("img"),
    ];

    expect(filterClipboardEntries(entries, "deploy").map((entry) => entry.id)).toEqual(["b", "img"]);
  });

  it("returns all entries when the search text is blank", () => {
    const entries = [textEntry("a", "one"), imageEntry("img")];

    expect(filterClipboardEntries(entries, "   ")).toEqual(entries);
  });

  it("derives text titles from the first non-empty line", () => {
    expect(clipboardEntryTitle(textEntry("a", "\n\n  npm run dev\nsecond line"))).toBe("npm run dev");
  });

  it("falls back to a text title when content is whitespace", () => {
    expect(clipboardEntryTitle(textEntry("a", "   "))).toBe("文本内容");
  });

  it("clamps long previews without removing line breaks from the source excerpt", () => {
    const preview = clipboardEntryPreview(textEntry("a", "line one\nline two\n" + "x".repeat(220)), 42);

    expect(preview.endsWith("...")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(45);
  });

  it("formats image titles and metadata", () => {
    const entry = imageEntry("img", 640, 480);

    expect(clipboardEntryTitle(entry)).toBe("图片 640x480");
    expect(clipboardEntryMeta(entry)).toBe("image");
  });

  it("formats text metadata by character count", () => {
    expect(clipboardEntryMeta(textEntry("a", "abcd"))).toBe("4 chars");
  });

  it("matches favorites by id", () => {
    expect(isFavoriteEntry(textEntry("a", "copy"), [textEntry("a", "copy")])).toBe(true);
    expect(isFavoriteEntry(textEntry("a", "copy"), [textEntry("b", "copy")])).toBe(false);
  });

  it("keeps the current selection when it is still visible", () => {
    const entries = [textEntry("a", "one"), textEntry("b", "two")];

    expect(resolveSelectedEntryId(entries, "b")).toBe("b");
  });

  it("selects the first visible entry when current selection disappeared", () => {
    const entries = [textEntry("a", "one"), textEntry("b", "two")];

    expect(resolveSelectedEntryId(entries, "missing")).toBe("a");
  });

  it("returns null when no entry is visible", () => {
    expect(resolveSelectedEntryId([], "missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the model tests and verify they fail**

Run:

```bash
cd app
npx vitest run src/components/clipboardPanelModel.test.ts
```

Expected: FAIL because `clipboardPanelModel.ts` does not exist.

- [ ] **Step 3: Implement the pure model helpers**

Create `app/src/components/clipboardPanelModel.ts`:

```ts
import type { ClipboardEntry } from "@/types/actions";

export function filterClipboardEntries(entries: ClipboardEntry[], search: string): ClipboardEntry[] {
  const query = search.trim().toLowerCase();
  if (!query) return entries;
  return entries.filter((entry) => {
    if (entry.kind === "image") return true;
    return entry.content.toLowerCase().includes(query);
  });
}

export function clipboardEntryTitle(entry: ClipboardEntry): string {
  if (entry.kind === "image") return `图片 ${entry.width}x${entry.height}`;
  const firstLine = entry.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? clampText(firstLine, 34) : "文本内容";
}

export function clipboardEntryPreview(entry: ClipboardEntry, maxLength = 140): string {
  if (entry.kind === "image") return `${entry.width}x${entry.height}`;
  return clampText(entry.content.trim() || "空文本", maxLength);
}

export function clipboardEntryMeta(entry: ClipboardEntry): string {
  if (entry.kind === "image") return "image";
  return `${entry.content.length} chars`;
}

export function isFavoriteEntry(entry: ClipboardEntry, favorites: ClipboardEntry[]): boolean {
  return favorites.some((favorite) => favorite.id === entry.id);
}

export function resolveSelectedEntryId(entries: ClipboardEntry[], selectedId: string | null): string | null {
  if (selectedId && entries.some((entry) => entry.id === selectedId)) return selectedId;
  return entries[0]?.id ?? null;
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength)).trimEnd()}...`;
}
```

- [ ] **Step 4: Run the model tests and verify they pass**

Run:

```bash
cd app
npx vitest run src/components/clipboardPanelModel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the model helpers**

Run:

```bash
git add app/src/components/clipboardPanelModel.ts app/src/components/clipboardPanelModel.test.ts
git commit -m "test: add clipboard dock model helpers"
```

## Task 2: Bottom Dock React Layout

**Files:**
- Modify: `app/src/components/ClipboardPanel.tsx`

- [ ] **Step 1: Replace `ClipboardPanel.tsx` with the dock component**

Replace `app/src/components/ClipboardPanel.tsx` with:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
  return (
    <button
      type="button"
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onCopy}
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
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 12, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {copied ? "已复制" : clipboardEntryTitle(entry)}
        </strong>
        <span
          role="button"
          tabIndex={-1}
          title={favorite ? "取消收藏" : "加入收藏"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          style={{ color: favorite ? "#facc15" : "rgba(255,255,255,0.28)", fontSize: 14 }}
        >
          {favorite ? "★" : "☆"}
        </span>
      </span>
      {entry.kind === "image" ? (
        <img
          src={`data:image/jpeg;base64,${entry.data}`}
          alt=""
          draggable={false}
          style={{ flex: 1, minHeight: 0, width: "100%", objectFit: "cover", borderRadius: 7, background: "rgba(255,255,255,0.08)" }}
          onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <span style={{ fontSize: 11, lineHeight: 1.35, color: "rgba(255,255,255,0.58)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: selected ? 3 : 2, WebkitBoxOrient: "vertical", whiteSpace: "pre-wrap" }}>
          {clipboardEntryPreview(entry, selected ? 130 : 72)}
        </span>
      )}
      <span style={{ marginTop: "auto", fontSize: 10, color: "rgba(255,255,255,0.34)" }}>{clipboardEntryMeta(entry)}</span>
    </button>
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
```

- [ ] **Step 2: Run frontend typecheck**

Run:

```bash
cd app
npx tsc --noEmit
```

Expected: PASS. If TypeScript reports `role="button"` on the star span as acceptable but lint later objects, change that span to a real `button` with transparent styling.

- [ ] **Step 3: Run model tests again**

Run:

```bash
cd app
npx vitest run src/components/clipboardPanelModel.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the React dock layout**

Run:

```bash
git add app/src/components/ClipboardPanel.tsx
git commit -m "feat: redesign clipboard as bottom dock"
```

## Task 3: Copy Close Behavior And Window Shell

**Files:**
- Modify: `app/src/builtins/clipboard/App.tsx`
- Modify: `app/src-tauri/tauri.conf.json`

- [ ] **Step 1: Update `ClipboardApp` copy handlers to respect keep-open**

In `app/src/builtins/clipboard/App.tsx`, change the text and image copy handlers to:

```tsx
  const handleCopyText = async (text: string, options?: { keepOpen?: boolean }) => {
    try {
      await invoke("set_clipboard_text", { text });
      if (!options?.keepOpen) {
        getCurrentWindow().hide().catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyImage = async (data: string, options?: { keepOpen?: boolean }) => {
    try {
      await invoke("set_clipboard_image", { data });
      if (!options?.keepOpen) {
        getCurrentWindow().hide().catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
  };
```

- [ ] **Step 2: Update the clipboard Tauri window size**

In `app/src-tauri/tauri.conf.json`, update the `clipboard` window object:

```json
      {
        "label": "clipboard",
        "url": "index.html?view=clipboard",
        "title": "DevLauncher Clipboard",
        "width": 960,
        "height": 260,
        "resizable": false,
        "decorations": false,
        "transparent": true,
        "shadow": false,
        "alwaysOnTop": false,
        "visibleOnAllWorkspaces": true,
        "center": true,
        "skipTaskbar": true,
        "visible": false
      },
```

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
cd app
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit copy behavior and window shell**

Run:

```bash
git add app/src/builtins/clipboard/App.tsx app/src-tauri/tauri.conf.json
git commit -m "feat: add clipboard dock copy pin behavior"
```

## Task 4: Bottom Window Placement In Rust

**Files:**
- Modify: `app/src-tauri/src/builtins/clipboard.rs`

- [ ] **Step 1: Add imports for window positioning**

At the top of `app/src-tauri/src/builtins/clipboard.rs`, change the Tauri import to:

```rust
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};
```

- [ ] **Step 2: Add pure placement helper and tests**

Add this helper near `fn apply_pin_state`:

```rust
const CLIPBOARD_DOCK_WIDTH: u32 = 960;
const CLIPBOARD_DOCK_HEIGHT: u32 = 260;
const CLIPBOARD_DOCK_BOTTOM_MARGIN: i32 = 28;

fn bottom_dock_position(
    work_area_position: PhysicalPosition<i32>,
    work_area_size: PhysicalSize<u32>,
    window_size: PhysicalSize<u32>,
    bottom_margin: i32,
) -> PhysicalPosition<i32> {
    let x = work_area_position.x
        + ((work_area_size.width as i32 - window_size.width as i32) / 2).max(0);
    let y = work_area_position.y
        + work_area_size.height as i32
        - window_size.height as i32
        - bottom_margin;
    PhysicalPosition::new(x, y.max(work_area_position.y))
}
```

Add these tests at the bottom of the file:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bottom_dock_position_centers_window_and_uses_bottom_margin() {
        let pos = bottom_dock_position(
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1440, 900),
            PhysicalSize::new(960, 260),
            28,
        );

        assert_eq!(pos.x, 240);
        assert_eq!(pos.y, 612);
    }

    #[test]
    fn bottom_dock_position_clamps_y_to_work_area_top_on_short_screen() {
        let pos = bottom_dock_position(
            PhysicalPosition::new(10, 40),
            PhysicalSize::new(800, 220),
            PhysicalSize::new(960, 260),
            28,
        );

        assert_eq!(pos.x, 10);
        assert_eq!(pos.y, 40);
    }
}
```

- [ ] **Step 3: Run the Rust tests and verify the helper passes**

Run:

```bash
cd app/src-tauri
RUSTC=/opt/homebrew/opt/rustup/bin/rustc rustup run stable cargo test builtins::clipboard::tests::bottom_dock_position
```

Expected: PASS.

- [ ] **Step 4: Apply bottom placement before showing clipboard**

Add this function near the helper:

```rust
fn position_clipboard_dock(app: &tauri::AppHandle, win: &tauri::WebviewWindow) -> Result<(), String> {
    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let area = monitor.work_area();
    let window_size = PhysicalSize::new(CLIPBOARD_DOCK_WIDTH, CLIPBOARD_DOCK_HEIGHT);
    let position = bottom_dock_position(
        area.position,
        area.size,
        window_size,
        CLIPBOARD_DOCK_BOTTOM_MARGIN,
    );
    win.set_size(window_size).map_err(|e| e.to_string())?;
    win.set_position(position).map_err(|e| e.to_string())
}
```

Then change both `toggle_clipboard_window` and `show_clipboard_window` so the visible path calls `position_clipboard_dock` before `show`:

```rust
#[tauri::command]
pub fn toggle_clipboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("clipboard") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            apply_pin_state(&app, "clipboard");
            position_clipboard_dock(&app, &win)?;
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
            let _ = app.emit_to("clipboard", "clipboard-refresh", ());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_clipboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("clipboard") {
        apply_pin_state(&app, "clipboard");
        position_clipboard_dock(&app, &win)?;
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        let _ = app.emit_to("clipboard", "clipboard-refresh", ());
    }
    Ok(())
}
```

- [ ] **Step 5: Run Rust checks**

Run:

```bash
cd app/src-tauri
RUSTC=/opt/homebrew/opt/rustup/bin/rustc rustup run stable cargo test builtins::clipboard::tests::bottom_dock_position
RUSTC=/opt/homebrew/opt/rustup/bin/rustc rustup run stable cargo check
```

Expected: both PASS.

- [ ] **Step 6: Commit Rust placement**

Run:

```bash
git add app/src-tauri/src/builtins/clipboard.rs
git commit -m "feat: position clipboard window as bottom dock"
```

## Task 5: Final Verification And Polish

**Files:**
- Modify only files already touched if verification finds issues.

- [ ] **Step 1: Run the full focused automated checks**

Run:

```bash
cd app
npx vitest run src/components/clipboardPanelModel.test.ts
npx tsc --noEmit
cd src-tauri
RUSTC=/opt/homebrew/opt/rustup/bin/rustc rustup run stable cargo test builtins::clipboard::tests::bottom_dock_position
RUSTC=/opt/homebrew/opt/rustup/bin/rustc rustup run stable cargo check
```

Expected: all PASS.

- [ ] **Step 2: Start the app for manual QA**

Run:

```bash
cd app
npm run tauri dev
```

Expected: DevLauncher starts. If port `1420` is already occupied, stop the existing dev server or let Tauri reuse the configured dev server.

- [ ] **Step 3: Manual QA checklist**

Verify:

- Open clipboard with `Cmd+Opt+V` on macOS or the configured shortcut on the current platform.
- The clipboard appears near the bottom of the screen.
- Hovering a text item slides/scales the card and shows a readable floating preview.
- Hovering an image item slides/scales the card and shows image details.
- Searching filters text matches while keeping image entries visible.
- Switching to favorites clears search.
- Starring from a card updates favorites.
- Starring from the preview updates favorites.
- Copy while unpinned closes the window.
- Pin the dock, copy, and confirm the window remains open with "已复制" feedback.
- Esc closes the window.
- Reopen and confirm entries refresh.

- [ ] **Step 4: Commit any manual QA fixes**

If fixes were needed, commit only the touched files:

```bash
git add app/src/components/ClipboardPanel.tsx app/src/components/clipboardPanelModel.ts app/src-tauri/src/builtins/clipboard.rs app/src-tauri/tauri.conf.json
git commit -m "fix: polish clipboard bottom dock"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

Spec coverage:

- Bottom window layout: Task 2 and Task 4.
- Search and favorites: Task 1 and Task 2.
- Text/image cards and floating preview: Task 2.
- Pin-controlled copy behavior: Task 2 and Task 3.
- Esc close: preserved in existing `ClipboardApp`, verified in Task 5.
- Bottom placement: Task 4.
- Motion and reduced motion: Task 2.
- Automated and manual verification: Task 5.

Placeholder scan:

- No TBD, TODO, placeholder, or "implement later" steps remain.

Type consistency:

- `onCopyText` and `onCopyImage` accept `options?: { keepOpen?: boolean }` in `ClipboardPanel` and `ClipboardApp`.
- `ClipboardEntry` helper functions use the existing `kind`, `id`, `content`, `data`, `width`, and `height` fields.
- Rust placement helpers use `PhysicalPosition<i32>` and `PhysicalSize<u32>` consistently.
