import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyThemeFromConfig } from "@/api/theme";
import {
  clearScreenshots,
  deleteScreenshot,
  loadScreenshots,
  saveScreenshots,
  setPendingScreenshotEdit,
  type StoredScreenshot,
  type StoredScreenshotAnnotation,
} from "../screenshotStore";

type MarkerTone = "problem" | "expected" | "focus";

type Annotation = {
  id: number;
  label: string;
  tone: MarkerTone;
  color?: string;
  x: number;
  y: number;
  burnedIn?: boolean;
};

const DRAFT_KEY = "screenshotai_annotation_draft";

const toneMeta: Record<MarkerTone, { label: string; color: string }> = {
  problem: { label: "问题", color: "#ff3b30" },
  expected: { label: "期望", color: "#34c759" },
  focus: { label: "关注", color: "#ffcc00" },
};

const panelStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.045)",
  boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.13)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.065)",
  color: "rgba(255,255,255,0.88)",
  padding: "9px 10px",
  fontSize: 13,
  outline: "none",
};

const btnStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.78)",
  cursor: "pointer",
  fontSize: 12,
  padding: "7px 10px",
  lineHeight: 1,
};

const dangerBtnStyle: CSSProperties = {
  ...btnStyle,
  color: "rgba(255,255,255,0.9)",
  background: "rgba(255,59,48,0.16)",
  border: "1px solid rgba(255,59,48,0.35)",
};

function annotationColor(annotation: Annotation) {
  return annotation.color || toneMeta[annotation.tone].color;
}

function toneFromColor(color: string | undefined, fallback: MarkerTone = "problem"): MarkerTone {
  const normalized = color?.toLowerCase();
  if (normalized === "#34c759") return "expected";
  if (normalized === "#ffcc00" || normalized === "#ffd60a") return "focus";
  if (normalized === "#ff3b30" || normalized === "#ff6b7a") return "problem";
  return fallback;
}

const titleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(255,255,255,0.9)",
};

const mutedStyle: CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.44)",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 30,
};

function SectionHeader({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, minHeight: 30 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <div style={titleStyle}>{title}</div>
        {meta && <div style={mutedStyle}>{meta}</div>}
      </div>
      {action && <div style={toolbarStyle}>{action}</div>}
    </div>
  );
}

function buildPrompt(appName: string, page: string, operation: string, expected: string, annotations: Annotation[]) {
  const lines = annotations
    .filter((annotation) => annotation.label.trim())
    .map((annotation) => `${annotation.id}. [${toneMeta[annotation.tone].label}] ${annotation.label.trim()} (坐标约 ${Math.round(annotation.x * 100)}%, ${Math.round(annotation.y * 100)}%)`)
    .join("\n");

  return `请根据截图中的编号分析这个 UI 问题。

上下文：
- 应用：${appName || "待补充"}
- 页面：${page || "待补充"}
- 当前操作：${operation || "待补充"}

截图标注：
${lines || "1. 待补充"}

期望效果：
${expected || "待补充"}

请帮我判断：
- 可能的问题原因
- 应该检查哪些组件、状态或 API
- 推荐修复方案
- 如果是在当前项目中，请先搜索相关代码，再给出实现路径`;
}

function toStoredAnnotations(annotations: Annotation[]): StoredScreenshotAnnotation[] {
  return annotations.map((annotation) => ({
    id: annotation.id,
    label: annotation.label,
    tone: annotation.tone,
    x: annotation.x,
    y: annotation.y,
    burnedIn: annotation.burnedIn ?? false,
    kind: "marker",
    color: annotationColor(annotation),
  }));
}

function drawNumberAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  width: number,
  height: number,
) {
  const x = annotation.x * width;
  const y = annotation.y * height;
  const radius = Math.max(18, Math.round(width * 0.012));
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = annotationColor(annotation);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(radius * 0.95)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(annotation.id), x, y + 1);

  const text = annotation.label.trim();
  if (text) {
    ctx.font = "600 14px Arial";
    const padX = 9;
    const textX = x + radius + 10;
    const textY = y - 13;
    const boxW = ctx.measureText(text).width + padX * 2;
    const boxH = 26;
    ctx.fillStyle = "rgba(28,28,30,0.78)";
    ctx.beginPath();
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(textX, textY, boxW, boxH, 8);
    } else {
      ctx.rect(textX, textY, boxW, boxH);
    }
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textAlign = "left";
    ctx.fillText(text, textX + padX, textY + boxH / 2 + 1);
  }
  ctx.restore();
}

async function decodeImage(item: StoredScreenshot) {
  const image = new Image();
  image.src = `data:image/jpeg;base64,${item.data}`;
  await image.decode();
  return image;
}

export function ScreenshotAiApp() {
  const [items, setItems] = useState<StoredScreenshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [appName, setAppName] = useState("");
  const [page, setPage] = useState("");
  const [operation, setOperation] = useState("");
  const [expected, setExpected] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [zoom, setZoom] = useState(100);
  const [copied, setCopied] = useState<"none" | "prompt" | "image">("none");
  const [status, setStatus] = useState("");

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    applyThemeFromConfig();

    const refresh = () => {
      const loaded = loadScreenshots();
      setItems(loaded);
      setSelectedId((current) => current && loaded.some((item) => item.id === current) ? current : loaded[0]?.id ?? null);
    };

    refresh();
    const unlistenScreenshots = listen("screenshots-updated", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("devlauncher-screenshots-updated", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        setAppName(draft.appName ?? "");
        setPage(draft.page ?? "");
        setOperation(draft.operation ?? "");
        setExpected(draft.expected ?? "");
        setAnnotations(Array.isArray(draft.annotations) ? draft.annotations : []);
        setZoom(Number(draft.zoom ?? 100));
      } catch {}
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") getCurrentWindow().hide().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("devlauncher-screenshots-updated", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("keydown", onKey);
      unlistenScreenshots.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ appName, page, operation, expected, annotations, zoom }));
  }, [appName, page, operation, expected, annotations, zoom]);

  useEffect(() => {
    if (!selected?.annotations?.length) {
      setAnnotations([]);
      return;
    }
    setAnnotations(selected.annotations.map((annotation) => ({
      id: annotation.id,
      label: annotation.label,
      tone: toneFromColor(annotation.color, annotation.tone ?? "problem"),
      color: annotation.color,
      x: annotation.x,
      y: annotation.y,
      burnedIn: annotation.burnedIn,
    })));
  }, [selected?.id, selected?.annotations]);

  const prompt = useMemo(
    () => buildPrompt(appName, page, operation, expected, annotations),
    [appName, page, operation, expected, annotations],
  );

  function setAnnotationsAndPersist(next: Annotation[]) {
    setAnnotations(next);
    if (!selected) return;
    const nextItems = items.map((item) => (
      item.id === selected.id ? { ...item, annotations: toStoredAnnotations(next) } : item
    ));
    setItems(nextItems);
    saveScreenshots(nextItems);
  }

  function updateAnnotation(id: number, patch: Partial<Annotation>) {
    setAnnotationsAndPersist(annotations.map((annotation) => annotation.id === id ? { ...annotation, ...patch } : annotation));
  }

  function updateAnnotationTone(id: number, tone: MarkerTone) {
    updateAnnotation(id, { tone, color: toneMeta[tone].color });
  }

  function deleteAnnotation(id: number) {
    setAnnotationsAndPersist(annotations.filter((annotation) => annotation.id !== id));
  }

  function deleteItem(id: string) {
    const next = deleteScreenshot(id);
    setItems(next);
    setSelectedId((current) => {
      if (current !== id) return current;
      return next[0]?.id ?? null;
    });
  }

  function clearItems() {
    if (items.length === 0) return;
    if (!window.confirm("清空所有截图？")) return;
    clearScreenshots();
    setItems([]);
    setSelectedId(null);
    setAnnotations([]);
  }

  async function editSelectedScreenshot() {
    if (!selected) return;
    setPendingScreenshotEdit({
      id: selected.id,
      data: selected.data,
      width: selected.width,
      height: selected.height,
      annotations: toStoredAnnotations(annotations),
    });
    await invoke("show_screenshot_editor_window", { width: selected.width, height: selected.height });
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied("prompt");
    window.setTimeout(() => setCopied("none"), 1400);
  }

  async function copyAnnotatedImage() {
    if (!selected) {
      setStatus("没有可标注截图");
      return;
    }
    const image = await decodeImage(selected);
    const canvas = document.createElement("canvas");
    canvas.width = selected.width;
    canvas.height = selected.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, selected.width, selected.height);

    for (const annotation of annotations.filter((item) => !item.burnedIn)) {
      drawNumberAnnotation(ctx, annotation, selected.width, selected.height);
    }

    const dataUrl = canvas.toDataURL("image/png");
    await invoke("set_clipboard_image", { data: dataUrl.split(",")[1] });
    setCopied("image");
    setStatus("已复制标注图");
    window.setTimeout(() => setCopied("none"), 1400);
  }

  const scale = zoom / 100;
  const visibleAnnotations = annotations.filter((item) => !item.burnedIn);
  const selectedIndex = selected ? items.findIndex((item) => item.id === selected.id) + 1 : 0;

  return (
    <div className="glass" style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 14, color: "rgba(255,255,255,0.88)" }}>
      <div data-tauri-drag-region style={{ height: 54, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 14px 0 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <div data-tauri-drag-region style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 750, letterSpacing: 0 }}>截图问题报告</div>
          <div style={{ ...mutedStyle, marginTop: 3 }}>{items.length} 张截图 · {annotations.length} 条标注</div>
        </div>
        <button onClick={() => getCurrentWindow().hide().catch(() => {})} style={{ ...btnStyle, width: 28, height: 28, padding: 0, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }}>x</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "228px minmax(430px, 1fr) 360px", gridTemplateRows: "minmax(260px, 1fr) minmax(220px, 36vh)", gap: 12, padding: 12, overflow: "hidden" }}>
        <section style={{ ...panelStyle, gridRow: "1 / span 2", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <SectionHeader
              title="截图列表"
              meta={selected ? `${selectedIndex}/${items.length}` : undefined}
              action={<button onClick={clearItems} disabled={items.length === 0} style={{ ...dangerBtnStyle, padding: "6px 8px", opacity: items.length === 0 ? 0.45 : 1 }}>清空</button>}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 8 }}>
            {items.length === 0 && (
              <div style={{ ...mutedStyle, lineHeight: 1.7, padding: 10 }}>暂无截图</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((item) => {
                const active = item.id === selected?.id;
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 6,
                      borderRadius: 8,
                      border: active ? "1px solid rgba(78,186,255,0.72)" : "1px solid rgba(255,255,255,0.075)",
                      background: active ? "rgba(78,186,255,0.14)" : "rgba(255,255,255,0.035)",
                      color: "rgba(255,255,255,0.84)",
                      textAlign: "left",
                      position: "relative",
                    }}
                  >
                    <button
                      onClick={() => setSelectedId(item.id)}
                      style={{ all: "unset", display: "grid", gridTemplateColumns: "72px 1fr", gap: 8, width: "100%", cursor: "pointer", alignItems: "center" }}
                    >
                      <img src={`data:image/jpeg;base64,${item.data}`} alt="" style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 6, display: "block", border: "1px solid rgba(255,255,255,0.1)" }} />
                      <div style={{ minWidth: 0, paddingRight: 28 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{item.width} x {item.height}</div>
                        <div style={{ ...mutedStyle, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                      </div>
                    </button>
                    <button
                      title="删除截图"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteItem(item.id);
                      }}
                      style={{ ...dangerBtnStyle, position: "absolute", right: 7, top: 22, width: 24, height: 24, padding: 0, borderRadius: 7 }}
                    >
                      -
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section style={{ ...panelStyle, gridColumn: 2, gridRow: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <SectionHeader
                title="截图预览"
                meta={selected ? `${selected.width} x ${selected.height} · ${visibleAnnotations.length} 个编号` : undefined}
                action={
                  <>
                    <span style={mutedStyle}>{zoom}%</span>
                    <input type="range" min={50} max={220} step={10} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} style={{ width: 104 }} />
                    <button onClick={editSelectedScreenshot} disabled={!selected} style={{ ...btnStyle, opacity: selected ? 1 : 0.45 }}>编辑</button>
                    <button onClick={copyAnnotatedImage} disabled={!selected} style={{ ...btnStyle, opacity: selected ? 1 : 0.45 }}>{copied === "image" ? "已复制" : "复制图"}</button>
                  </>
                }
              />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: "rgba(0,0,0,0.28)" }}>
              {selected ? (
                <div style={{ position: "relative", width: selected.width * scale, height: selected.height * scale, margin: 14, boxShadow: "0 16px 50px rgba(0,0,0,0.32)" }}>
                  <img src={`data:image/jpeg;base64,${selected.data}`} alt="selected screenshot" draggable={false} style={{ display: "block", width: selected.width * scale, height: selected.height * scale, userSelect: "none", borderRadius: 4 }} />
                  {visibleAnnotations.map((annotation) => (
                    <div key={annotation.id} style={{ position: "absolute", left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: annotationColor(annotation), border: "2px solid rgba(255,255,255,0.92)", color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.35)", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }}>
                        {annotation.id}
                      </div>
                      {annotation.label.trim() && (
                        <div style={{ borderRadius: 8, background: "rgba(28,28,30,0.82)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.92)", fontSize: 12, fontWeight: 600, padding: "5px 8px", boxShadow: "0 6px 16px rgba(0,0,0,0.22)", whiteSpace: "nowrap" }}>
                          {annotation.label}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)", fontSize: 12 }}>暂无截图</div>
              )}
            </div>
        </section>

        <section style={{ gridColumn: 2, gridRow: 2, display: "grid", gridTemplateColumns: "minmax(240px, 0.9fr) minmax(300px, 1.1fr)", gap: 12, minHeight: 0, overflow: "hidden" }}>
          <div style={{ ...panelStyle, padding: 12, display: "flex", flexDirection: "column", gap: 9, overflow: "hidden" }}>
            <SectionHeader title="问题上下文" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input style={inputStyle} value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="应用" />
              <input style={inputStyle} value={page} onChange={(event) => setPage(event.target.value)} placeholder="页面/窗口" />
            </div>
            <textarea style={{ ...inputStyle, minHeight: 62, resize: "vertical" }} value={operation} onChange={(event) => setOperation(event.target.value)} placeholder="当前操作" />
            <textarea style={{ ...inputStyle, minHeight: 62, resize: "vertical" }} value={expected} onChange={(event) => setExpected(event.target.value)} placeholder="期望效果" />
          </div>

          <div style={{ ...panelStyle, padding: 12, display: "flex", flexDirection: "column", gap: 8, minHeight: 0, overflow: "hidden" }}>
            <SectionHeader
              title="编号备注"
              meta={`${annotations.length} 条`}
              action={<button onClick={() => setAnnotationsAndPersist([])} disabled={annotations.length === 0} style={{ ...btnStyle, opacity: annotations.length === 0 ? 0.45 : 1 }}>清空</button>}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 7, overflow: "auto", paddingRight: 2 }}>
              {annotations.length === 0 && <div style={{ ...mutedStyle, padding: "6px 2px" }}>暂无编号</div>}
              {annotations.map((annotation) => (
                <div key={annotation.id} style={{ display: "grid", gridTemplateColumns: "28px 78px 1fr 28px", gap: 6, alignItems: "center" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: annotationColor(annotation), color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.35)", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{annotation.id}</div>
                  <select
                    value={annotation.tone}
                    onChange={(event) => updateAnnotationTone(annotation.id, event.target.value as MarkerTone)}
                    style={{ ...inputStyle, padding: "7px 6px", height: 34, background: "rgba(28,28,30,0.96)", color: "rgba(255,255,255,0.92)", borderColor: annotationColor(annotation), colorScheme: "dark" }}
                  >
                    <option value="problem" style={{ background: "#1c1c1e", color: "#fff" }}>问题</option>
                    <option value="expected" style={{ background: "#1c1c1e", color: "#fff" }}>期望</option>
                    <option value="focus" style={{ background: "#1c1c1e", color: "#fff" }}>关注</option>
                  </select>
                  <input style={{ ...inputStyle, height: 34 }} value={annotation.label} onChange={(event) => updateAnnotation(annotation.id, { label: event.target.value })} placeholder="说明" />
                  <button onClick={() => deleteAnnotation(annotation.id)} style={{ ...btnStyle, width: 28, height: 28, padding: 0 }}>-</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ ...panelStyle, gridColumn: 3, gridRow: "1 / span 2", padding: 12, minHeight: 0, display: "flex", flexDirection: "column", gap: 9, overflow: "hidden" }}>
          <SectionHeader
            title="AI Prompt"
            meta={`${prompt.length} 字符`}
            action={<button onClick={copyPrompt} style={btnStyle}>{copied === "prompt" ? "已复制" : "复制 Prompt"}</button>}
          />
          <pre style={{ flex: 1, minHeight: 0, margin: 0, overflow: "auto", whiteSpace: "pre-wrap", borderRadius: 8, background: "rgba(0,0,0,0.26)", border: "1px solid rgba(255,255,255,0.07)", padding: 12, fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.78)", fontFamily: "Consolas, 'Cascadia Code', monospace" }}>{prompt}</pre>
          {status && <div style={{ ...mutedStyle, color: "rgba(255,255,255,0.58)" }}>{status}</div>}
        </section>
      </div>
    </div>
  );
}
