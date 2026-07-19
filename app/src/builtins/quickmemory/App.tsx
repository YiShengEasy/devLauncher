import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyThemeFromConfig } from "@/api/theme";
import { WindowPinButton } from "@/components/WindowPinButton";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import {
  createQuickMemoryId,
  deleteCustomCategory,
  deleteCustomItem,
  filterMemoryItems,
  getOrderedCategoryItems,
  mergeQuickMemoryData,
  parseTags,
  validateCategoryDraft,
  validateItemDraft,
  type CategoryDraft,
  type ItemDraft,
} from "./data";
import {
  EMPTY_QUICKMEMORY_DATA,
  kindLabel,
  type CategoryId,
  type MemoryCategory,
  type MemoryItem,
  type PointerDragState,
  type QuickMemoryData,
} from "./model";
import { loadQuickMemoryData, saveQuickMemoryData } from "./storage";

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

type ItemFormDraft = ItemDraft & {
  category: CategoryId;
  priority: boolean;
};

const miniButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(248,250,252,0.76)",
  borderRadius: 6,
  padding: "2px 5px",
  fontSize: 10,
  cursor: "pointer",
};

const categoryActionButtonStyle: CSSProperties = {
  width: "100%",
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "#f8fafc",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

const primaryActionButtonStyle: CSSProperties = {
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(94,234,212,0.38)",
  background: "rgba(94,234,212,0.12)",
  color: "#ccfbf1",
  cursor: "pointer",
  padding: "0 10px",
  fontSize: 12,
  fontWeight: 700,
};

const dialogBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "rgba(2,6,23,0.62)",
  zIndex: 9000,
};

const dialogStyle: CSSProperties = {
  width: 420,
  maxWidth: "calc(100vw - 36px)",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(15,23,42,0.98)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.42)",
  padding: 14,
  display: "grid",
  gap: 10,
};

const dialogTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  color: "#f8fafc",
};

const dialogInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#f8fafc",
  outline: "none",
  padding: "8px 10px",
  fontSize: 12,
  boxSizing: "border-box",
};

const dialogErrorStyle: CSSProperties = {
  fontSize: 12,
  color: "#fca5a5",
};

const dialogActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

export function QuickMemoryApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardListRef = useRef<HTMLElement | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryId>("linux");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [quickMemoryData, setQuickMemoryData] = useState<QuickMemoryData>(EMPTY_QUICKMEMORY_DATA);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ mode: "create" | "edit"; categoryId?: string } | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>({ name: "", subtitle: "", accent: "#5eead4" });
  const [itemDialog, setItemDialog] = useState<{ mode: "create" | "edit"; itemId?: string } | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemFormDraft>({
    title: "",
    value: "",
    detail: "",
    kind: "command",
    tagsText: "",
    priority: false,
    category: activeCategory,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const pointerDragRef = useRef<PointerDragState | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const reducedMotion = useReducedMotion();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();
  const mergedData = useMemo(() => mergeQuickMemoryData(quickMemoryData), [quickMemoryData]);
  const categories = mergedData.categories;
  const memoryItems = mergedData.items;
  const orderState = mergedData.order;
  const copyCounts = mergedData.copyCounts;

  useEffect(() => {
    applyThemeFromConfig();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadQuickMemoryData()
      .then((data) => {
        if (cancelled) return;
        setQuickMemoryData(data);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeWindow();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return filterMemoryItems(getOrderedCategoryItems(activeCategory, memoryItems, orderState), normalized);
  }, [activeCategory, memoryItems, orderState, query]);

  const activeMeta = categories.find((category) => category.id === activeCategory) ?? categories[0];
  const categoryCount = memoryItems.filter((item) => item.category === activeCategory).length;

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(cardListRef, () => {
    if (draggingId || !cardListRef.current) return;
    const cards = Array.from(cardListRef.current.querySelectorAll<HTMLElement>("[data-memory-card-id]"));
    animateListEnter(cards, reducedMotion);
  }, [activeCategory, query, filteredItems.length, draggingId, reducedMotion]);

  const closeWindow = () => {
    getCurrentWindow().hide().catch((error) => {
      console.error("hide quick memory window failed", error);
    });
  };

  const handleClose = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    closeWindow();
  };

  const handleDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    getCurrentWindow().startDragging().catch((error) => {
      console.error("start quick memory drag failed", error);
    });
  };

  const persistQuickMemoryData = async (next: QuickMemoryData) => {
    setQuickMemoryData(next);
    try {
      await saveQuickMemoryData(next);
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  const openCreateCategory = () => {
    setCategoryDraft({ name: "", subtitle: "", accent: "#5eead4" });
    setFormError(null);
    setCategoryDialog({ mode: "create" });
  };

  const openEditCategory = (category: MemoryCategory) => {
    if (category.source !== "custom") return;
    setCategoryDraft({ name: category.name, subtitle: category.subtitle, accent: category.accent });
    setFormError(null);
    setCategoryDialog({ mode: "edit", categoryId: category.id });
  };

  const openCreateItem = () => {
    setItemDraft({
      title: "",
      value: "",
      detail: "",
      kind: "command",
      tagsText: "",
      priority: false,
      category: activeCategory,
    });
    setFormError(null);
    setItemDialog({ mode: "create" });
  };

  const openEditItem = (item: MemoryItem) => {
    if (item.source !== "custom") return;
    setItemDraft({
      title: item.title,
      value: item.value,
      detail: item.detail,
      kind: item.kind,
      tagsText: item.tags.join(", "),
      priority: Boolean(item.priority),
      category: item.category,
    });
    setFormError(null);
    setItemDialog({ mode: "edit", itemId: item.id });
  };

  const saveCategoryDraft = async () => {
    const error = validateCategoryDraft(categoryDraft);
    if (error) {
      setFormError(error);
      return;
    }
    const now = new Date().toISOString();
    const nextCategories = categoryDialog?.mode === "edit" && categoryDialog.categoryId
      ? quickMemoryData.customCategories.map((category) =>
          category.id === categoryDialog.categoryId
            ? {
                ...category,
                name: categoryDraft.name.trim(),
                subtitle: categoryDraft.subtitle.trim(),
                accent: categoryDraft.accent.trim(),
                updatedAt: now,
              }
            : category
        )
      : [
          ...quickMemoryData.customCategories,
          {
            id: createQuickMemoryId("category"),
            name: categoryDraft.name.trim(),
            subtitle: categoryDraft.subtitle.trim(),
            accent: categoryDraft.accent.trim(),
            createdAt: now,
            updatedAt: now,
          },
        ];
    await persistQuickMemoryData({ ...quickMemoryData, customCategories: nextCategories });
    setCategoryDialog(null);
  };

  const saveItemDraft = async () => {
    const error = validateItemDraft(itemDraft);
    if (error) {
      setFormError(error);
      return;
    }
    const now = new Date().toISOString();
    const normalized = {
      category: itemDraft.category,
      title: itemDraft.title.trim(),
      value: itemDraft.value.trim(),
      detail: itemDraft.detail.trim(),
      kind: itemDraft.kind,
      tags: parseTags(itemDraft.tagsText),
      priority: itemDraft.priority,
      updatedAt: now,
    };
    const nextItems = itemDialog?.mode === "edit" && itemDialog.itemId
      ? quickMemoryData.customItems.map((item) =>
          item.id === itemDialog.itemId ? { ...item, ...normalized } : item
        )
      : [
          ...quickMemoryData.customItems,
          {
            id: createQuickMemoryId("memory"),
            ...normalized,
            createdAt: now,
          },
        ];
    await persistQuickMemoryData({ ...quickMemoryData, customItems: nextItems });
    setItemDialog(null);
  };

  const removeCustomCategory = async (categoryId: string) => {
    const category = categories.find((entry) => entry.id === categoryId);
    if (!category || category.source !== "custom") return;
    const confirmed = await confirmAction({
      title: "删除分类",
      message: `将删除“${category.name}”以及其中的全部自定义记忆。此操作无法撤销。`,
      confirmLabel: "删除分类",
    });
    if (!confirmed) return;
    const next = deleteCustomCategory(quickMemoryData, categoryId);
    await persistQuickMemoryData(next);
    setActiveCategory("linux");
  };

  const removeCustomItem = async (itemId: string) => {
    const item = memoryItems.find((entry) => entry.id === itemId);
    if (!item || item.source !== "custom") return;
    const confirmed = await confirmAction({
      title: "删除记忆",
      message: `将删除“${item.title}”。此操作无法撤销。`,
      confirmLabel: "删除记忆",
    });
    if (!confirmed) return;
    await persistQuickMemoryData(deleteCustomItem(quickMemoryData, itemId));
  };

  const handleCopy = async (item: MemoryItem) => {
    try {
      await copyText(item.value);
      setCopiedId(item.id);
      const next = {
        ...quickMemoryData,
        copyCounts: { ...copyCounts, [item.id]: (copyCounts[item.id] ?? 0) + 1 },
      };
      void persistQuickMemoryData(next);
      window.setTimeout(() => setCopiedId((current) => current === item.id ? null : current), 1200);
    } catch (error) {
      console.error("copy quick memory failed", error);
    }
  };

  const handleCardClick = (item: MemoryItem) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    handleCopy(item);
  };

  const swapCards = (draggedItemId: string, targetItemId: string) => {
    if (draggedItemId === targetItemId) return;
    const draggedItem = memoryItems.find((item) => item.id === draggedItemId);
    const targetItem = memoryItems.find((item) => item.id === targetItemId);
    if (!draggedItem || !targetItem || draggedItem.category !== targetItem.category) return;

    const category = draggedItem.category;
    const currentIds = getOrderedCategoryItems(category, memoryItems, orderState).map((item) => item.id);
    const draggedIndex = currentIds.indexOf(draggedItemId);
    const targetIndex = currentIds.indexOf(targetItemId);
    if (draggedIndex < 0 || targetIndex < 0) return;
    const nextIds = [...currentIds];
    nextIds[draggedIndex] = targetItemId;
    nextIds[targetIndex] = draggedItemId;
    const nextOrder = { ...orderState, [category]: nextIds };
    void persistQuickMemoryData({ ...quickMemoryData, order: nextOrder });
  };

  const resetPointerDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
    setDragPos(null);
    pointerDragRef.current = null;
    window.setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 0);
  };

  const registerCard = (id: string, element: HTMLElement | null) => {
    if (element) {
      cardRefs.current.set(id, element);
    } else {
      cardRefs.current.delete(id);
    }
  };

  const getDropTargetAtPoint = (x: number, y: number, draggedItemId: string): string | null => {
    for (const [id, element] of cardRefs.current) {
      if (id === draggedItemId) continue;
      const rect = element.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return id;
      }
    }
    return null;
  };

  const handleCardMouseDown = (item: MemoryItem, event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    pointerDragRef.current = {
      itemId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const state = pointerDragRef.current;
      if (!state) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (!state.isDragging && Math.hypot(dx, dy) < 4) return;
      if (!state.isDragging) {
        state.isDragging = true;
        suppressNextClickRef.current = true;
        setDraggingId(state.itemId);
      }
      setDragPos({ x: moveEvent.clientX, y: moveEvent.clientY });
      setDropTarget(getDropTargetAtPoint(moveEvent.clientX, moveEvent.clientY, state.itemId));
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const state = pointerDragRef.current;
      if (state?.isDragging) {
        const target = getDropTargetAtPoint(upEvent.clientX, upEvent.clientY, state.itemId);
        if (target) swapCards(state.itemId, target);
      }
      resetPointerDrag();
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const renderDragGhost = () => {
    if (!draggingId || !dragPos) return null;
    const item = memoryItems.find((entry) => entry.id === draggingId);
    if (!item) return null;
    return (
      <div
        style={{
          position: "fixed",
          left: dragPos.x - 95,
          top: dragPos.y - 58,
          width: 190,
          minHeight: 116,
          borderRadius: 8,
          border: `1px solid ${activeMeta.accent}`,
          background: "rgba(15,23,42,0.96)",
          boxShadow: "0 18px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
          padding: 9,
          display: "grid",
          gridTemplateRows: "auto auto 1fr auto",
          gap: 6,
          pointerEvents: "none",
          zIndex: 9999,
          opacity: 0.9,
          transform: "scale(1.04)",
          transition: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title}
          </span>
          <span
            style={{
              fontSize: 10,
              color: item.kind === "command" ? "#bae6fd" : "#fed7aa",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 999,
              padding: "2px 6px",
              flexShrink: 0,
            }}
          >
            {kindLabel[item.kind]}
          </span>
        </div>
        <div
          style={{
            minHeight: 30,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(3,7,18,0.52)",
            color: "#e2e8f0",
            padding: "6px 8px",
            fontFamily: "Cascadia Code, Consolas, monospace",
            fontSize: 11,
            lineHeight: 1.35,
            overflowWrap: "anywhere",
          }}
        >
          {item.value}
        </div>
        <p style={{ margin: 0, color: "rgba(226,232,240,0.60)", fontSize: 11, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {item.detail}
        </p>
        <span style={{ fontSize: 10, color: activeMeta.accent }}>拖拽排序</span>
      </div>
    );
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: "#eef2ff",
        overflow: "hidden",
      }}
    >
      <div
        ref={rootRef}
        className="glass"
        style={{
          width: "calc(100vw - 20px)",
          height: "calc(100vh - 20px)",
          minWidth: 720,
          minHeight: 520,
          borderRadius: 14,
          display: "grid",
          gridTemplateRows: "54px 1fr",
          overflow: "hidden",
          background: "rgba(13, 17, 30, 0.92)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div
          onMouseDown={handleDragStart}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            cursor: "move",
          }}
        >
          <div
            title="拖动移动窗口"
            style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, alignSelf: "stretch", minWidth: 0 }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(135deg, rgba(94,234,212,0.22), rgba(249,115,22,0.20))",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#bffbf0",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              MEM
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0 }}>快捷记忆</div>
              <div style={{ fontSize: 11, color: "rgba(226,232,240,0.56)", marginTop: 2 }}>
                开发常用命令与快捷键速查
              </div>
              {(loadError || saveError) && (
                <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 2 }}>
                  {loadError ? `加载失败：${loadError}` : `保存失败：${saveError}`}
                </div>
              )}
            </div>
          </div>

          <div
            onMouseDown={(event) => event.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <input
              onMouseDown={(event) => event.stopPropagation()}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索命令、快捷键、标签"
              style={{
                width: 240,
                height: 32,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#f8fafc",
                outline: "none",
                padding: "0 10px",
                fontSize: 12,
              }}
            />
            <WindowPinButton />
            <button
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleClose}
              title="关闭 (Esc)"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(248,250,252,0.72)",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: "24px",
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", minHeight: 0 }}>
          <aside
            style={{
              borderRight: "1px solid rgba(255,255,255,0.08)",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minHeight: 0,
              background: "rgba(255,255,255,0.025)",
            }}
          >
            <button
              onClick={openCreateCategory}
              onMouseDown={(event) => event.stopPropagation()}
              style={categoryActionButtonStyle}
            >
              新增类别
            </button>
            {categories.map((category) => {
              const selected = category.id === activeCategory;
              const count = memoryItems.filter((item) => item.category === category.id).length;
              return (
                <div
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveCategory(category.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    width: "100%",
                    minHeight: 50,
                    borderRadius: 8,
                    border: selected ? `1px solid ${category.accent}` : "1px solid rgba(255,255,255,0.07)",
                    background: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.025)",
                    color: "#f8fafc",
                    cursor: "pointer",
                    padding: "7px 9px",
                    textAlign: "left",
                    display: "grid",
                    gap: 3,
                    boxShadow: selected ? `inset 3px 0 0 ${category.accent}` : "none",
                    outline: "none",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{category.name}</span>
                    <span style={{ fontSize: 11, color: selected ? category.accent : "rgba(226,232,240,0.42)" }}>
                      {count}
                    </span>
                  </span>
                  {category.source === "custom" && (
                    <span style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditCategory(category);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        style={miniButtonStyle}
                      >
                        编辑
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeCustomCategory(category.id);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        style={miniButtonStyle}
                      >
                        删除
                      </button>
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: "rgba(226,232,240,0.52)", lineHeight: 1.3 }}>
                    {category.subtitle}
                  </span>
                </div>
              );
            })}
          </aside>

          <main style={{ minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
            <section
              ref={cardListRef}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: activeMeta.accent }} />
                  <h1 style={{ fontSize: 16, lineHeight: 1.2, fontWeight: 750, margin: 0 }}>{activeMeta.name}</h1>
                  <span
                    style={{
                      fontSize: 11,
                      color: activeMeta.accent,
                      border: `1px solid ${activeMeta.accent}55`,
                      borderRadius: 999,
                      padding: "2px 8px",
                      background: `${activeMeta.accent}12`,
                    }}
                  >
                    {categoryCount} 条
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(226,232,240,0.58)", lineHeight: 1.35 }}>
                  左侧用于切换分类；中间卡片是速查内容，点击命令或快捷键即可复制。
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "rgba(226,232,240,0.42)" }}>
                  {query ? `匹配 ${filteredItems.length} 条` : "拖拽卡片交换排序"}
                </span>
                <button
                  onClick={openCreateItem}
                  onMouseDown={(event) => event.stopPropagation()}
                  style={primaryActionButtonStyle}
                >
                  新增记忆
                </button>
              </div>
            </section>

            <section
              style={{
                minHeight: 0,
                overflow: "auto",
                padding: 10,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                alignContent: "start",
                gap: 8,
              }}
            >
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  data-memory-card-id={item.id}
                  ref={(element) => registerCard(item.id, element)}
                  onClick={() => handleCardClick(item)}
                  onMouseDown={(event) => handleCardMouseDown(item, event)}
                  role="button"
                  tabIndex={0}
                  title="点击复制，拖动排序"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleCopy(item);
                    }
                  }}
                  style={{
                    minHeight: 118,
                    borderRadius: 8,
                    border: dropTarget === item.id ? `1px solid ${activeMeta.accent}` : "1px solid rgba(255,255,255,0.08)",
                    background: dropTarget === item.id ? `${activeMeta.accent}16` : "rgba(255,255,255,0.045)",
                    padding: 9,
                    display: "grid",
                    gridTemplateRows: "auto auto 1fr auto",
                    gap: 6,
                    cursor: "grab",
                    opacity: draggingId === item.id ? 0.28 : 1,
                    outline: "none",
                    userSelect: "none",
                    transform: dropTarget === item.id ? "scale(1.015)" : "scale(1)",
                    boxShadow: dropTarget === item.id ? `0 0 18px ${activeMeta.accent}35` : "none",
                    transition: "opacity 0.12s ease, background 0.12s ease, border-color 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {item.priority && (
                        <span
                          style={{
                            fontSize: 10,
                            color: activeMeta.accent,
                            border: `1px solid ${activeMeta.accent}55`,
                            background: `${activeMeta.accent}12`,
                            borderRadius: 999,
                            padding: "2px 6px",
                          }}
                        >
                          高频
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 10,
                          color: item.kind === "command" ? "#bae6fd" : "#fed7aa",
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.06)",
                          borderRadius: 999,
                          padding: "2px 6px",
                        }}
                      >
                        {kindLabel[item.kind]}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      width: "100%",
                      minHeight: 30,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(3,7,18,0.52)",
                      color: "#e2e8f0",
                      padding: "6px 8px",
                      textAlign: "left",
                      fontFamily: "Cascadia Code, Consolas, monospace",
                      fontSize: 11,
                      lineHeight: 1.35,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.value}
                  </div>

                  <p style={{ margin: 0, color: "rgba(226,232,240,0.60)", fontSize: 11, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {item.detail}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            color: "rgba(226,232,240,0.50)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 999,
                            padding: "1px 5px",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {item.source === "custom" && (
                      <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditItem(item);
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          style={miniButtonStyle}
                        >
                          编辑
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeCustomItem(item.id);
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          style={miniButtonStyle}
                        >
                          删除
                        </button>
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: copiedId === item.id ? activeMeta.accent : "rgba(226,232,240,0.38)", flexShrink: 0 }}>
                      {copiedId === item.id ? "已复制" : `复制 ${copyCounts[item.id] ?? 0} 次`}
                    </span>
                  </div>
                </article>
              ))}

              {filteredItems.length === 0 && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    height: 220,
                    borderRadius: 8,
                    border: "1px dashed rgba(255,255,255,0.12)",
                    display: "grid",
                    placeItems: "center",
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 13,
                  }}
                >
                  没有匹配的记忆项
                </div>
              )}
              {renderDragGhost()}
              {categoryDialog && (
                <div style={dialogBackdropStyle}>
                  <div style={dialogStyle}>
                    <h2 style={dialogTitleStyle}>{categoryDialog.mode === "create" ? "新增类别" : "编辑类别"}</h2>
                    <input
                      value={categoryDraft.name}
                      onChange={(event) => setCategoryDraft((draft) => ({ ...draft, name: event.target.value }))}
                      placeholder="类别名称"
                      style={dialogInputStyle}
                    />
                    <input
                      value={categoryDraft.subtitle}
                      onChange={(event) => setCategoryDraft((draft) => ({ ...draft, subtitle: event.target.value }))}
                      placeholder="说明"
                      style={dialogInputStyle}
                    />
                    <input
                      value={categoryDraft.accent}
                      onChange={(event) => setCategoryDraft((draft) => ({ ...draft, accent: event.target.value }))}
                      placeholder="#5eead4"
                      style={dialogInputStyle}
                    />
                    {formError && <div style={dialogErrorStyle}>{formError}</div>}
                    <div style={dialogActionsStyle}>
                      <button onClick={() => setCategoryDialog(null)} style={miniButtonStyle}>取消</button>
                      <button onClick={() => void saveCategoryDraft()} style={primaryActionButtonStyle}>保存</button>
                    </div>
                  </div>
                </div>
              )}
              {itemDialog && (
                <div style={dialogBackdropStyle}>
                  <div style={dialogStyle}>
                    <h2 style={dialogTitleStyle}>{itemDialog.mode === "create" ? "新增记忆" : "编辑记忆"}</h2>
                    <select
                      value={itemDraft.category}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, category: event.target.value }))}
                      style={dialogInputStyle}
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                    <input
                      value={itemDraft.title}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, title: event.target.value }))}
                      placeholder="标题"
                      style={dialogInputStyle}
                    />
                    <textarea
                      value={itemDraft.value}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, value: event.target.value }))}
                      placeholder="命令或快捷键"
                      style={{ ...dialogInputStyle, minHeight: 70, resize: "vertical" }}
                    />
                    <textarea
                      value={itemDraft.detail}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, detail: event.target.value }))}
                      placeholder="说明"
                      style={{ ...dialogInputStyle, minHeight: 60, resize: "vertical" }}
                    />
                    <select
                      value={itemDraft.kind}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, kind: event.target.value as "command" | "shortcut" }))}
                      style={dialogInputStyle}
                    >
                      <option value="command">命令</option>
                      <option value="shortcut">快捷键</option>
                    </select>
                    <input
                      value={itemDraft.tagsText}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, tagsText: event.target.value }))}
                      placeholder="标签，用逗号或空格分隔"
                      style={dialogInputStyle}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(226,232,240,0.72)" }}>
                      <input
                        type="checkbox"
                        checked={itemDraft.priority}
                        onChange={(event) => setItemDraft((draft) => ({ ...draft, priority: event.target.checked }))}
                      />
                      置顶
                    </label>
                    {formError && <div style={dialogErrorStyle}>{formError}</div>}
                    <div style={dialogActionsStyle}>
                      <button onClick={() => setItemDialog(null)} style={miniButtonStyle}>取消</button>
                      <button onClick={() => void saveItemDraft()} style={primaryActionButtonStyle}>保存</button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
