import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyThemeFromConfig } from "@/api/theme";
import { loadScreenshots, saveScreenshots, type StoredScreenshot, type StoredScreenshotAnnotation } from "../screenshotStore";

type MarkerTone = "problem" | "expected" | "focus";

type Annotation = {
  id: number;
  label: string;
  tone: MarkerTone;
  x: number;
  y: number;
  burnedIn?: boolean;
};

const DRAFT_KEY = "screenshotai_annotation_draft";

const toneMeta: Record<MarkerTone, { label: string; color: string }> = {
  problem: { label: "问题", color: "#ff6b7a" },
  expected: { label: "期望", color: "#34c759" },
  focus: { label: "关注", color: "#ffd60a" },
};

const panelStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.045)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.88)",
  padding: "8px 10px",
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
  padding: "7px 11px",
};

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

function getPointInImage(event: MouseEvent<HTMLDivElement>, image: HTMLImageElement) {
  const rect = image.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
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
  ctx.fillStyle = toneMeta[annotation.tone].color;
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
  const imageRef = useRef<HTMLImageElement>(null);
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
      tone: annotation.tone ?? "problem",
      x: annotation.x,
      y: annotation.y,
      burnedIn: annotation.burnedIn,
    })));
  }, [selected?.id]);

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

  function addPoint(event: MouseEvent<HTMLDivElement>) {
    if (!selected) return;
    const image = imageRef.current;
    if (!image) return;
    const point = getPointInImage(event, image);
    if (!point) return;
    const id = annotations.reduce((max, annotation) => Math.max(max, annotation.id), 0) + 1;
    setAnnotationsAndPersist([...annotations, { id, label: "", tone: "problem", x: point.x, y: point.y }]);
  }

  function updateAnnotation(id: number, patch: Partial<Annotation>) {
    setAnnotationsAndPersist(annotations.map((annotation) => annotation.id === id ? { ...annotation, ...patch } : annotation));
  }

  function deleteAnnotation(id: number) {
    setAnnotationsAndPersist(annotations.filter((annotation) => annotation.id !== id));
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

  return (
    <div className="glass" style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 14, color: "rgba(255,255,255,0.88)" }}>
      <div data-tauri-drag-region style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <div data-tauri-drag-region>
          <div style={{ fontSize: 14, fontWeight: 700 }}>AI 截图标注</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)" }}>从截图插件保存的截图列表中选择，默认预览最新截图</div>
        </div>
        <button onClick={() => getCurrentWindow().hide().catch(() => {})} style={{ ...btnStyle, width: 28, height: 28, padding: 0 }}>x</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "240px minmax(420px, 1fr) 340px", gap: 12, padding: 14, overflow: "hidden" }}>
        <section style={{ ...panelStyle, padding: 10, overflow: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>截图列表</div>
          {items.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.6 }}>暂无截图。先打开“截图”插件，确认保存一个截图。</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{
                  padding: 7,
                  borderRadius: 8,
                  border: item.id === selected?.id ? "1px solid rgba(56,189,248,0.55)" : "1px solid rgba(255,255,255,0.08)",
                  background: item.id === selected?.id ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.8)",
                  textAlign: "left",
                }}
              >
                <img src={`data:image/jpeg;base64,${item.data}`} alt="" style={{ width: "100%", height: 78, objectFit: "cover", borderRadius: 6, display: "block", marginBottom: 6 }} />
                <div style={{ fontSize: 11, fontWeight: 700 }}>{item.width} x {item.height}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.42)" }}>{item.title}</div>
              </button>
            ))}
          </div>
        </section>

        <section style={{ ...panelStyle, padding: 12, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>截图预览</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{zoom}%</span>
              <input type="range" min={50} max={220} step={10} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} style={{ width: 100 }} />
              <button onClick={copyAnnotatedImage} style={btnStyle}>{copied === "image" ? "已复制" : "复制标注图"}</button>
            </div>
          </div>
          <div onClick={addPoint} style={{ flex: 1, minHeight: 0, overflow: "auto", background: "rgba(0,0,0,0.24)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", cursor: selected ? "crosshair" : "default" }}>
            {selected ? (
              <div style={{ position: "relative", width: selected.width * scale, height: selected.height * scale, margin: 12 }}>
                <img ref={imageRef} src={`data:image/jpeg;base64,${selected.data}`} alt="selected screenshot" draggable={false} style={{ display: "block", width: selected.width * scale, height: selected.height * scale, userSelect: "none" }} />
                {annotations.filter((item) => !item.burnedIn).map((annotation) => (
                  <div key={annotation.id} style={{ position: "absolute", left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: toneMeta[annotation.tone].color, border: "2px solid rgba(255,255,255,0.92)", color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.35)", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }}>
                      {annotation.id}
                    </div>
                    {annotation.label.trim() && (
                      <div style={{ borderRadius: 8, background: "rgba(28,28,30,0.78)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.92)", fontSize: 12, fontWeight: 600, padding: "5px 8px", boxShadow: "0 6px 16px rgba(0,0,0,0.22)", whiteSpace: "nowrap" }}>
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

        <section style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflow: "auto" }}>
          <div style={{ ...panelStyle, padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>问题上下文</div>
            <input style={inputStyle} value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="应用，例如 DevLauncher" />
            <input style={inputStyle} value={page} onChange={(event) => setPage(event.target.value)} placeholder="页面/窗口" />
            <textarea style={{ ...inputStyle, minHeight: 68, resize: "vertical" }} value={operation} onChange={(event) => setOperation(event.target.value)} placeholder="当前操作" />
            <textarea style={{ ...inputStyle, minHeight: 68, resize: "vertical" }} value={expected} onChange={(event) => setExpected(event.target.value)} placeholder="期望效果" />
          </div>

          <div style={{ ...panelStyle, padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>编号标注</div>
              <button onClick={() => setAnnotationsAndPersist([])} style={btnStyle}>清空</button>
            </div>
            {annotations.map((annotation) => (
              <div key={annotation.id} style={{ display: "grid", gridTemplateColumns: "30px 74px 1fr 26px", gap: 6, alignItems: "center" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: toneMeta[annotation.tone].color, color: "#111827", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{annotation.id}</div>
                <select value={annotation.tone} onChange={(event) => updateAnnotation(annotation.id, { tone: event.target.value as MarkerTone })} style={{ ...inputStyle, padding: "7px 6px" }}>
                  <option value="problem">问题</option>
                  <option value="expected">期望</option>
                  <option value="focus">关注</option>
                </select>
                <input style={inputStyle} value={annotation.label} onChange={(event) => updateAnnotation(annotation.id, { label: event.target.value })} placeholder="说明" />
                <button onClick={() => deleteAnnotation(annotation.id)} style={{ ...btnStyle, width: 26, height: 26, padding: 0 }}>-</button>
              </div>
            ))}
          </div>

          <div style={{ ...panelStyle, padding: 12, flex: 1, minHeight: 220, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>AI Prompt</div>
              <button onClick={copyPrompt} style={btnStyle}>{copied === "prompt" ? "已复制" : "复制 Prompt"}</button>
            </div>
            <pre style={{ flex: 1, margin: 0, overflow: "auto", whiteSpace: "pre-wrap", borderRadius: 8, background: "rgba(0,0,0,0.24)", border: "1px solid rgba(255,255,255,0.07)", padding: 12, fontSize: 12, lineHeight: 1.65, color: "rgba(255,255,255,0.78)", fontFamily: "Consolas, 'Cascadia Code', monospace" }}>{prompt}</pre>
            {status && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{status}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
