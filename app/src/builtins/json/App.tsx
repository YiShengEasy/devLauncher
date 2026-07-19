import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyThemeFromConfig } from "@/api/theme";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { MacWindowControls } from "@/components/MacWindowControls";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";

type JsonTab = "format" | "query" | "convert" | "diff" | "schema" | "history" | "openai";
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const HISTORY_KEY = "devlauncher.jsonHelper.history";
const MAX_HISTORY = 12;

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 7,
  color: "#e8eaf0",
  fontSize: 12,
  outline: "none",
};

const TEXTAREA_STYLE: React.CSSProperties = {
  width: "100%",
  flex: 1,
  minHeight: 128,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#e8eaf0",
  fontSize: 12,
  fontFamily: "Consolas, 'Cascadia Code', monospace",
  outline: "none",
  resize: "none",
  lineHeight: 1.5,
};

const BTN_STYLE: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 7,
  cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.78)",
  fontSize: 11,
  fontWeight: 600,
  outline: "none",
};

function parseJsonText(text: string): JsonValue {
  return JSON.parse(text) as JsonValue;
}

function stringify(value: unknown, spaces = 2): string {
  return JSON.stringify(value, null, spaces);
}

function errorWithLocation(err: unknown, source: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/position\s+(\d+)/i);
  if (!match) return message;
  const pos = Number(match[1]);
  const before = source.slice(0, pos);
  const line = before.split(/\r\n|\r|\n/).length;
  const col = before.length - Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
  const lineText = source.split(/\r\n|\r|\n/)[line - 1] ?? "";
  return `${message}\nline ${line}, column ${col}\n${lineText}\n${" ".repeat(Math.max(col - 1, 0))}^`;
}

function sortKeysDeep(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, JsonValue>>((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function previewValue(value: unknown): string {
  const text = typeof value === "string" ? value : stringify(value, 0);
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function pathToString(parts: Array<string | number>): string {
  return "$" + parts.map((p) => typeof p === "number" ? `[${p}]` : /^[A-Za-z_$][\w$]*$/.test(p) ? `.${p}` : `[${JSON.stringify(p)}]`).join("");
}

function collectMatches(value: JsonValue, term: string, parts: Array<string | number> = []): string[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => found.push(...collectMatches(item, q, [...parts, i])));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...parts, key];
      if (key.toLowerCase().includes(q)) found.push(`${pathToString(childPath)} = ${previewValue(child)}`);
      found.push(...collectMatches(child, q, childPath));
    }
    return found;
  }
  if (String(value).toLowerCase().includes(q)) found.push(`${pathToString(parts)} = ${previewValue(value)}`);
  return found;
}

function tokenizePath(path: string): Array<string | number> {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "$") return [];
  const src = trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
  const parts: Array<string | number> = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === ".") {
      i++;
      const start = i;
      while (i < src.length && /[A-Za-z0-9_$-]/.test(src[i])) i++;
      if (start === i) throw new Error("Invalid JSONPath segment");
      parts.push(src.slice(start, i));
    } else if (src[i] === "[") {
      const end = src.indexOf("]", i);
      if (end === -1) throw new Error("Missing ] in JSONPath");
      const raw = src.slice(i + 1, end).trim();
      parts.push(/^\d+$/.test(raw) ? Number(raw) : raw.replace(/^['"]|['"]$/g, ""));
      i = end + 1;
    } else {
      throw new Error("JSONPath must use .key or [index]");
    }
  }
  return parts;
}

function getByPath(value: JsonValue, path: string): unknown {
  let current: unknown = value;
  for (const part of tokenizePath(path)) {
    if (Array.isArray(current) && typeof part === "number") current = current[part];
    else if (current && typeof current === "object" && !Array.isArray(current) && typeof part === "string") current = (current as Record<string, unknown>)[part];
    else return undefined;
  }
  return current;
}

function typeName(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9_$]/g, " ").replace(/(?:^|\s+)(\w)/g, (_, c) => c.toUpperCase()).replace(/\s/g, "");
  return /^[A-Za-z_$]/.test(clean) ? clean : `Json${clean || "Root"}`;
}

function scalarType(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "unknown[]";
  if (typeof value === "object") return "Record<string, unknown>";
  return typeof value;
}

function inferType(value: JsonValue, rootName = "Root"): string {
  const declarations: string[] = [];
  const walk = (node: JsonValue, name: string): string => {
    if (Array.isArray(node)) {
      if (node.length === 0) return "unknown[]";
      return `${walk(node[0], `${name}Item`)}[]`;
    }
    if (!node || typeof node !== "object") return scalarType(node);
    const interfaceName = typeName(name);
    const fields = Object.entries(node).map(([key, child]) => {
      const optional = child === null ? "?" : "";
      const safeKey = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
      const childType = Array.isArray(child)
        ? child.length && child[0] && typeof child[0] === "object"
          ? `${walk(child[0], key)}[]`
          : child.length
            ? `${scalarType(child[0])}[]`
            : "unknown[]"
        : child && typeof child === "object"
          ? walk(child, key)
          : scalarType(child);
      return `  ${safeKey}${optional}: ${childType};`;
    });
    declarations.push(`interface ${interfaceName} {\n${fields.join("\n")}\n}`);
    return interfaceName;
  };
  const root = walk(value, rootName);
  return `${declarations.reverse().join("\n\n")}${declarations.length ? "\n\n" : ""}type JsonRoot = ${root};`;
}

function inferSchema(value: JsonValue): unknown {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    return { type: "array", items: value.length ? inferSchema(value[0]) : {} };
  }
  if (typeof value === "object") {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, child] of Object.entries(value)) {
      properties[key] = inferSchema(child);
      if (child !== null) required.push(key);
    }
    return { type: "object", properties, required, additionalProperties: false };
  }
  return { type: typeof value };
}

function diffValues(left: unknown, right: unknown, path = "$"): string[] {
  if (JSON.stringify(left) === JSON.stringify(right)) return [];
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left)) return [`~ ${path}: ${previewValue(left)} -> ${previewValue(right)}`];
    if (!Array.isArray(right)) return [`~ ${path}: ${previewValue(left)} -> ${previewValue(right)}`];
    const lines: string[] = [];
    const len = Math.max(left.length, right.length);
    for (let i = 0; i < len; i++) {
      if (i >= left.length) lines.push(`+ ${path}[${i}]: ${previewValue(right[i])}`);
      else if (i >= right.length) lines.push(`- ${path}[${i}]: ${previewValue(left[i])}`);
      else lines.push(...diffValues(left[i], right[i], `${path}[${i}]`));
    }
    return lines;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const lines: string[] = [];
    const keys = new Set([...Object.keys(left as Record<string, unknown>), ...Object.keys(right as Record<string, unknown>)]);
    for (const key of Array.from(keys).sort((a, b) => a.localeCompare(b))) {
      const leftObj = left as Record<string, unknown>;
      const rightObj = right as Record<string, unknown>;
      const childPath = /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
      if (!(key in leftObj)) lines.push(`+ ${childPath}: ${previewValue(rightObj[key])}`);
      else if (!(key in rightObj)) lines.push(`- ${childPath}: ${previewValue(leftObj[key])}`);
      else lines.push(...diffValues(leftObj[key], rightObj[key], childPath));
    }
    return lines;
  }
  return [`~ ${path}: ${previewValue(left)} -> ${previewValue(right)}`];
}

function jsonToYaml(value: JsonValue, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return value.map((item) => {
      if (item && typeof item === "object") return `${pad}-\n${jsonToYaml(item, indent + 2)}`;
      return `${pad}- ${yamlScalar(item)}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    return entries.map(([key, child]) => {
      if (child && typeof child === "object") return `${pad}${key}:\n${jsonToYaml(child, indent + 2)}`;
      return `${pad}${key}: ${yamlScalar(child)}`;
    }).join("\n");
  }
  return `${pad}${yamlScalar(value)}`;
}

function yamlScalar(value: JsonValue): string {
  if (typeof value === "string") return /^[\w .:/@-]*$/.test(value) && value !== "" ? value : JSON.stringify(value);
  return String(value);
}

function parseScalar(raw: string): JsonValue {
  const value = raw.trim();
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function yamlToJson(text: string): JsonValue {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  const parseBlock = (start: number, indent: number): [JsonValue, number] => {
    if (start >= lines.length) return [{}, start];
    const isArray = lines[start].trimStart().startsWith("- ");
    if (isArray) {
      const arr: JsonValue[] = [];
      let i = start;
      while (i < lines.length) {
        const lineIndent = lines[i].match(/^ */)?.[0].length ?? 0;
        if (lineIndent !== indent || !lines[i].trimStart().startsWith("- ")) break;
        const rest = lines[i].trimStart().slice(2).trim();
        if (rest) arr.push(parseScalar(rest));
        else {
          const [child, next] = parseBlock(i + 1, indent + 2);
          arr.push(child);
          i = next - 1;
        }
        i++;
      }
      return [arr, i];
    }
    const obj: Record<string, JsonValue> = {};
    let i = start;
    while (i < lines.length) {
      const lineIndent = lines[i].match(/^ */)?.[0].length ?? 0;
      if (lineIndent !== indent) break;
      const line = lines[i].trim();
      const sep = line.indexOf(":");
      if (sep === -1) throw new Error(`Invalid YAML line: ${line}`);
      const key = line.slice(0, sep).trim();
      const rest = line.slice(sep + 1).trim();
      if (rest) obj[key] = parseScalar(rest);
      else {
        const [child, next] = parseBlock(i + 1, indent + 2);
        obj[key] = child;
        i = next - 1;
      }
      i++;
    }
    return [obj, i];
  };
  return parseBlock(0, lines[0]?.match(/^ */)?.[0].length ?? 0)[0];
}

function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
}

export function JsonHelperApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const openAiListRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<JsonTab>("format");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("$.data");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeRoot, setTypeRoot] = useState("Root");
  const [diffInput, setDiffInput] = useState("");
  const [history, setHistory] = useState<string[]>(() => readHistory());
  const [oaiName, setOaiName] = useState("");
  const [oaiDesc, setOaiDesc] = useState("");
  const [oaiParams, setOaiParams] = useState<Array<{ name: string; type: string; desc: string; required: boolean }>>([
    { name: "", type: "string", desc: "", required: true },
  ]);
  const reducedMotion = useReducedMotion();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();

  useEffect(() => { applyThemeFromConfig(); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") getCurrentWindow().hide().catch(() => {});
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const parsed = useMemo(() => {
    if (!input.trim()) return null;
    try { return parseJsonText(input); } catch { return null; }
  }, [input]);

  const runJson = useCallback((fn: (value: JsonValue) => string) => {
    setError("");
    setOutput("");
    try {
      setOutput(fn(parseJsonText(input)));
    } catch (e) {
      setError(errorWithLocation(e, input));
    }
  }, [input]);

  const rememberInput = useCallback(() => {
    if (!input.trim()) return;
    const next = [input, ...history.filter((item) => item !== input)].slice(0, MAX_HISTORY);
    setHistory(next);
    saveHistory(next);
  }, [history, input]);

  const pasteClipboard = useCallback(async () => {
    const text = await invoke<string>("get_clipboard_text").catch(() => "");
    if (text) setInput(text);
  }, []);

  const copyOutput = useCallback(async () => {
    if (!output) return;
    await invoke("set_clipboard_text", { text: output }).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [output]);

  const generateOpenAI = () => {
    setError("");
    if (!oaiName.trim()) {
      setError("请输入函数名称");
      return;
    }
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];
    for (const p of oaiParams) {
      if (!p.name.trim()) continue;
      properties[p.name.trim()] = { type: p.type, description: p.desc };
      if (p.required) required.push(p.name.trim());
    }
    setOutput(stringify({
      type: "function",
      function: {
        name: oaiName.trim(),
        description: oaiDesc.trim(),
        parameters: { type: "object", properties, required },
      },
    }));
  };

  const tabs: { key: JsonTab; label: string }[] = [
    { key: "format", label: "格式化" },
    { key: "query", label: "查询" },
    { key: "convert", label: "转换" },
    { key: "diff", label: "Diff" },
    { key: "schema", label: "Schema" },
    { key: "history", label: "历史" },
    { key: "openai", label: "OpenAI" },
  ];

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(historyListRef, () => {
    if (activeTab !== "history" || !historyListRef.current) return;
    animateListEnter(Array.from(historyListRef.current.children), reducedMotion);
  }, [activeTab, history.length, reducedMotion]);

  useGsapContext(openAiListRef, () => {
    if (activeTab !== "openai" || !openAiListRef.current) return;
    animateListEnter(Array.from(openAiListRef.current.children), reducedMotion);
  }, [activeTab, oaiParams.length, reducedMotion]);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <div ref={rootRef} className="glass" style={{ width: "min(720px, 100vw)", height: "min(630px, 100vh)", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div data-tauri-drag-region style={{ height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", cursor: "move" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, pointerEvents: "none" }}>
            <BuiltinIcon feature="json" size={16} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>JSON 助手</span>
          </div>
          <MacWindowControls
            onClose={() => getCurrentWindow().hide().catch(() => {})}
            onMinimize={() => getCurrentWindow().minimize().catch(() => getCurrentWindow().hide().catch(() => {}))}
            closeTitle="关闭 JSON 助手"
            minimizeTitle="最小化 JSON 助手"
          />
        </div>

        <div style={{ display: "flex", gap: 2, padding: "8px 10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setError(""); }} style={{ padding: "5px 10px", borderRadius: "7px 7px 0 0", fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none", outline: "none", background: activeTab === t.key ? "rgba(255,255,255,0.10)" : "transparent", color: activeTab === t.key ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.40)", borderBottom: activeTab === t.key ? "2px solid #3b82f6" : "2px solid transparent" }}>{t.label}</button>
          ))}
        </div>

        <div style={{ padding: "10px 12px", display: "flex", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" }}>
          <button style={BTN_STYLE} onClick={pasteClipboard}>粘贴</button>
          <button style={BTN_STYLE} onClick={rememberInput}>保存历史</button>
          <button style={BTN_STYLE} onClick={() => { setInput(output); setOutput(""); }}>输出替换输入</button>
          <button style={BTN_STYLE} onClick={() => { const next = input; setInput(output); setOutput(next); }}>输入/输出互换</button>
          <button style={BTN_STYLE} onClick={() => { setInput(""); setOutput(""); setError(""); }}>清空</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: 12, display: "grid", gridTemplateColumns: activeTab === "diff" ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10 }}>
          <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{activeTab === "diff" ? "左侧 JSON" : "输入"}</span>
            <textarea style={TEXTAREA_STYLE} value={input} onChange={(e) => setInput(e.target.value)} placeholder={'粘贴 JSON，例如 {"name":"test"}'} />
          </div>

          {activeTab === "diff" && (
            <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>右侧 JSON</span>
              <textarea style={TEXTAREA_STYLE} value={diffInput} onChange={(e) => setDiffInput(e.target.value)} placeholder="粘贴要对比的 JSON" />
            </div>
          )}

          <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>输出</span>
              <button onClick={copyOutput} disabled={!output} style={{ ...BTN_STYLE, padding: "3px 9px", opacity: output ? 1 : 0.45 }}>{copied ? "已复制" : "复制"}</button>
            </div>
            <textarea style={TEXTAREA_STYLE} value={output} readOnly placeholder="处理结果" />
          </div>
        </div>

        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {activeTab === "format" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.75)", color: "#fff" }} onClick={() => runJson((v) => stringify(v))}>格式化</button>
              <button style={BTN_STYLE} onClick={() => runJson((v) => JSON.stringify(v))}>压缩</button>
              <button style={BTN_STYLE} onClick={() => runJson((v) => stringify(sortKeysDeep(v)))}>按 key 排序</button>
              <button style={BTN_STYLE} onClick={() => { setError(""); setOutput(JSON.stringify(input)); }}>转义字符串</button>
              <button style={BTN_STYLE} onClick={() => runJson((v) => typeof v === "string" ? v : stringify(v))}>去转义</button>
            </div>
          )}

          {activeTab === "query" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input style={INPUT_STYLE} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="$.data.items[0]" />
                <button style={BTN_STYLE} onClick={() => runJson((v) => stringify(getByPath(v, query)))}>查询</button>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input style={INPUT_STYLE} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索 key 或 value" />
                <button style={BTN_STYLE} onClick={() => runJson((v) => collectMatches(v, searchTerm).join("\n") || "未找到")}>搜索</button>
              </div>
            </div>
          )}

          {activeTab === "convert" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input style={{ ...INPUT_STYLE, width: 150 }} value={typeRoot} onChange={(e) => setTypeRoot(e.target.value)} placeholder="Root type name" />
              <button style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.75)", color: "#fff" }} onClick={() => runJson((v) => inferType(v, typeRoot || "Root"))}>生成 TypeScript 类型</button>
              <button style={BTN_STYLE} onClick={() => runJson((v) => jsonToYaml(v))}>JSON 转 YAML</button>
              <button style={BTN_STYLE} onClick={() => { setError(""); try { setOutput(stringify(yamlToJson(input))); } catch (e) { setError(String(e)); } }}>YAML 转 JSON</button>
            </div>
          )}

          {activeTab === "diff" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.75)", color: "#fff" }} onClick={() => {
                setError("");
                try {
                  const lines = diffValues(parseJsonText(input), parseJsonText(diffInput));
                  setOutput(lines.length ? lines.join("\n") : "两个 JSON 一致");
                } catch (e) {
                  setOutput("");
                  setError(String(e));
                }
              }}>对比 JSON</button>
              <button style={BTN_STYLE} onClick={() => { const next = input; setInput(diffInput); setDiffInput(next); }}>左右互换</button>
            </div>
          )}

          {activeTab === "schema" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.75)", color: "#fff" }} onClick={() => runJson((v) => stringify(inferSchema(v)))}>生成 JSON Schema</button>
              <button style={BTN_STYLE} onClick={() => runJson((v) => stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", ...(inferSchema(v) as Record<string, unknown>) }))}>带 $schema</button>
            </div>
          )}

          {activeTab === "history" && (
            <div ref={historyListRef} className="motion-list motion-scroll-area" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 104 }}>
              {history.length === 0 && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>暂无历史，点击“保存历史”保存当前输入。</span>}
              {history.map((item, index) => (
                <div key={`${item.slice(0, 24)}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 6, alignItems: "center" }}>
                  <button style={{ ...BTN_STYLE, textAlign: "left", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }} onClick={() => setInput(item)}>{previewValue(item)}</button>
                  <button style={BTN_STYLE} onClick={() => { setInput(item); setActiveTab("format"); }}>载入</button>
                  <button style={BTN_STYLE} onClick={async () => {
                    const confirmed = await confirmAction({
                      title: "删除 JSON 历史",
                      message: "将删除这条已保存的 JSON 历史记录。此操作无法撤销。",
                      confirmLabel: "删除记录",
                    });
                    if (!confirmed) return;
                    const next = history.filter((_, i) => i !== index);
                    setHistory(next);
                    saveHistory(next);
                  }}>删除</button>
                </div>
              ))}
            </div>
          )}

          {activeTab === "openai" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 6 }}>
                <input style={INPUT_STYLE} value={oaiName} onChange={(e) => setOaiName(e.target.value)} placeholder="函数名 get_weather" />
                <input style={INPUT_STYLE} value={oaiDesc} onChange={(e) => setOaiDesc(e.target.value)} placeholder="函数描述" />
              </div>
              <div ref={openAiListRef} className="motion-list motion-scroll-area" style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 92 }}>
                {oaiParams.map((p, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 1.3fr 54px 28px", gap: 4, alignItems: "center" }}>
                    <input style={INPUT_STYLE} value={p.name} onChange={(e) => setOaiParams(oaiParams.map((x, n) => n === i ? { ...x, name: e.target.value } : x))} placeholder="参数名" />
                    <select style={INPUT_STYLE} value={p.type} onChange={(e) => setOaiParams(oaiParams.map((x, n) => n === i ? { ...x, type: e.target.value } : x))}>
                      {["string", "number", "boolean", "array", "object"].map((t) => <option key={t} value={t} style={{ background: "#1a1c2e", color: "#e8eaf0" }}>{t}</option>)}
                    </select>
                    <input style={INPUT_STYLE} value={p.desc} onChange={(e) => setOaiParams(oaiParams.map((x, n) => n === i ? { ...x, desc: e.target.value } : x))} placeholder="描述" />
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", display: "flex", gap: 3, alignItems: "center" }}><input type="checkbox" checked={p.required} onChange={(e) => setOaiParams(oaiParams.map((x, n) => n === i ? { ...x, required: e.target.checked } : x))} />必填</label>
                    <button style={{ ...BTN_STYLE, padding: "4px 0" }} onClick={() => setOaiParams(oaiParams.filter((_, n) => n !== i))}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={BTN_STYLE} onClick={() => setOaiParams([...oaiParams, { name: "", type: "string", desc: "", required: false }])}>添加参数</button>
                <button style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.75)", color: "#fff" }} onClick={generateOpenAI}>生成 OpenAI tool</button>
              </div>
            </div>
          )}

          {error && (
            <pre className="motion-scroll-area" style={{ margin: 0, whiteSpace: "pre-wrap", padding: "7px 10px", borderRadius: 7, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "rgba(255,145,145,0.92)", fontSize: 11, fontFamily: "Consolas, monospace", maxHeight: 72 }}>{error}</pre>
          )}

          {!error && parsed !== null && (
            <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 11 }}>
              当前 JSON 有效，根类型：{Array.isArray(parsed) ? "array" : parsed === null ? "null" : typeof parsed}
            </div>
          )}
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
