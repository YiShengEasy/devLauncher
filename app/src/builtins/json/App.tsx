import { useEffect, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { applyThemeFromConfig } from "@/api/theme";

type JsonTab = "format" | "escape" | "unescape" | "openai";

export function JsonHelperApp() {
  const [activeTab, setActiveTab] = useState<JsonTab>("format");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  // Apply theme on mount
  useEffect(() => { applyThemeFromConfig(); }, []);

  const [copied, setCopied] = useState(false);

  // ── OpenAI doc generator state ──
  const [oaiName, setOaiName] = useState("");
  const [oaiDesc, setOaiDesc] = useState("");
  const [oaiParams, setOaiParams] = useState<Array<{ name: string; type: string; desc: string; required: boolean }>>([
    { name: "", type: "string", desc: "", required: true },
  ]);

  // Esc to hide window
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") getCurrentWindow().hide().catch(() => {});
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const copyOutput = useCallback(async () => {
    if (!output) return;
    try {
      await invoke("set_clipboard_text", { text: output });
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }, [output]);

  // ── Format ──
  const handleFormat = useCallback(() => {
    setError("");
    setOutput("");
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
    } catch (e) {
      setError(String(e));
    }
  }, [input]);

  // ── Minify ──
  const handleMinify = useCallback(() => {
    setError("");
    setOutput("");
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
    } catch (e) {
      setError(String(e));
    }
  }, [input]);

  // ── Escape ──
  const handleEscape = useCallback(() => {
    setError("");
    setOutput("");
    try {
      const escaped = JSON.stringify(input);
      setOutput(escaped);
    } catch (e) {
      setError(String(e));
    }
  }, [input]);

  // ── Unescape ──
  const handleUnescape = useCallback(() => {
    setError("");
    setOutput("");
    try {
      const unescaped = JSON.parse(input);
      if (typeof unescaped === "string") {
        setOutput(unescaped);
      } else {
        setOutput(JSON.stringify(unescaped, null, 2));
      }
    } catch (e) {
      setError(String(e));
    }
  }, [input]);

  // ── Generate OpenAI function doc ──
  const handleGenerateOpenAI = useCallback(() => {
    setError("");
    setOutput("");
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
    const doc = {
      type: "function",
      function: {
        name: oaiName.trim(),
        description: oaiDesc.trim(),
        parameters: {
          type: "object",
          properties,
          required,
        },
      },
    };
    setOutput(JSON.stringify(doc, null, 2));
  }, [oaiName, oaiDesc, oaiParams]);

  const addParam = () => {
    setOaiParams([...oaiParams, { name: "", type: "string", desc: "", required: false }]);
  };
  const removeParam = (idx: number) => {
    setOaiParams(oaiParams.filter((_, i) => i !== idx));
  };
  const updateParam = (idx: number, field: string, value: string | boolean) => {
    setOaiParams(oaiParams.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const TABS: { key: JsonTab; label: string }[] = [
    { key: "format", label: "格式化" },
    { key: "escape", label: "转义" },
    { key: "unescape", label: "去转义" },
    { key: "openai", label: "OpenAI 文档" },
  ];

  const TEXTAREA_STYLE: React.CSSProperties = {
    width: "100%", flex: 1, minHeight: 160,
    padding: "10px 12px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, color: "#e8eaf0",
    fontSize: 13, fontFamily: "monospace",
    outline: "none", resize: "vertical",
    lineHeight: 1.5,
  };

  const BTN_STYLE: React.CSSProperties = {
    padding: "6px 14px", borderRadius: 7, cursor: "pointer",
    border: "none", fontSize: 12, fontWeight: 600,
    transition: "all 0.12s", outline: "none",
  };

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <div className="glass" style={{ width: 660, height: 580, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Title bar */}
        <div data-tauri-drag-region style={{
          height: 36, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", cursor: "move",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, pointerEvents: "none" }}>
            <BuiltinIcon feature="json" size={16} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>JSON 助手</span>
          </div>
          <button
            onClick={() => getCurrentWindow().hide().catch(() => {})}
            style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(255,95,87,0.85)", border: "none", cursor: "pointer", padding: 0 }}
            title="关闭"
          />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, padding: "8px 10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key); setOutput(""); setError(""); }}
              style={{
                padding: "5px 12px", borderRadius: "7px 7px 0 0", fontSize: 12, fontWeight: 500,
                cursor: "pointer", border: "none", outline: "none",
                background: activeTab === t.key ? "rgba(255,255,255,0.10)" : "transparent",
                color: activeTab === t.key ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.38)",
                borderBottom: activeTab === t.key ? "2px solid #3b82f6" : "2px solid transparent",
                transition: "all 0.12s",
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, overflow: "auto" }}>
          {/* Format / Escape / Unescape: input → output */}
          {activeTab !== "openai" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>输入</span>
                <textarea
                  style={TEXTAREA_STYLE}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    activeTab === "format" ? '粘贴 JSON，如 {"name":"test"}' :
                    activeTab === "escape" ? "输入需要转义的文本" :
                    '输入需要去转义的 JSON 字符串，如 \\"hello\\"'
                  }
                />
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                {activeTab === "format" && (
                  <>
                    <button style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.80)", color: "#fff" }} onClick={handleFormat}>格式化</button>
                    <button style={{ ...BTN_STYLE, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }} onClick={handleMinify}>压缩</button>
                  </>
                )}
                {activeTab === "escape" && (
                  <button style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.80)", color: "#fff" }} onClick={handleEscape}>转义</button>
                )}
                {activeTab === "unescape" && (
                  <button style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.80)", color: "#fff" }} onClick={handleUnescape}>去转义</button>
                )}
                <button
                  style={{ ...BTN_STYLE, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }}
                  onClick={() => { setInput(""); setOutput(""); setError(""); }}
                >清空</button>
              </div>
            </>
          )}

          {/* OpenAI doc generator */}
          {activeTab === "openai" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 4 }}>函数名称 *</span>
                  <input
                    style={{ width: "100%", padding: "6px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "monospace" }}
                    placeholder="get_weather"
                    value={oaiName}
                    onChange={(e) => setOaiName(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 4 }}>函数描述</span>
                <input
                  style={{ width: "100%", padding: "6px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#e8eaf0", fontSize: 13, outline: "none" }}
                  placeholder="获取指定城市的天气信息"
                  value={oaiDesc}
                  onChange={(e) => setOaiDesc(e.target.value)}
                />
              </div>
              {/* Params */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>参数列表</span>
                  <button style={{ ...BTN_STYLE, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", fontSize: 11, padding: "3px 8px" }} onClick={addParam}>+ 添加参数</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto" }}>
                  {oaiParams.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input
                        style={{ flex: 2, padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 5, color: "#e8eaf0", fontSize: 12, outline: "none", fontFamily: "monospace" }}
                        placeholder="参数名"
                        value={p.name}
                        onChange={(e) => updateParam(i, "name", e.target.value)}
                      />
                      <select
                        value={p.type}
                        onChange={(e) => updateParam(i, "type", e.target.value)}
                        style={{ flex: 1, padding: "4px 6px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 5, color: "#e8eaf0", fontSize: 12, outline: "none", cursor: "pointer" }}
                      >
                        <option value="string" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>string</option>
                        <option value="number" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>number</option>
                        <option value="boolean" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>boolean</option>
                        <option value="array" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>array</option>
                        <option value="object" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>object</option>
                      </select>
                      <input
                        style={{ flex: 2, padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 5, color: "#e8eaf0", fontSize: 12, outline: "none" }}
                        placeholder="描述"
                        value={p.desc}
                        onChange={(e) => updateParam(i, "desc", e.target.value)}
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: "rgba(255,255,255,0.5)", cursor: "pointer", flexShrink: 0 }}>
                        <input type="checkbox" checked={p.required} onChange={(e) => updateParam(i, "required", e.target.checked)} />
                        必填
                      </label>
                      <button
                        onClick={() => removeParam(i)}
                        style={{ background: "none", border: "none", color: "rgba(239,68,68,0.6)", cursor: "pointer", fontSize: 14, padding: "0 4px", flexShrink: 0 }}
                        title="删除"
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                <button style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.80)", color: "#fff" }} onClick={handleGenerateOpenAI}>生成文档</button>
                <button style={{ ...BTN_STYLE, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }} onClick={() => { setOaiName(""); setOaiDesc(""); setOaiParams([{ name: "", type: "string", desc: "", required: true }]); setOutput(""); setError(""); }}>重置</button>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: "6px 10px", borderRadius: 7, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "rgba(239,68,68,0.85)", fontSize: 12, fontFamily: "monospace", wordBreak: "break-all" }}>
              {error}
            </div>
          )}

          {/* Output */}
          {output && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>输出</span>
                <button
                  onClick={copyOutput}
                  style={{ ...BTN_STYLE, background: copied ? "rgba(34,197,94,0.20)" : "rgba(255,255,255,0.08)", color: copied ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.65)", fontSize: 11, padding: "3px 10px" }}
                >{copied ? "已复制" : "复制"}</button>
              </div>
              <textarea
                style={{ ...TEXTAREA_STYLE, minHeight: 80 }}
                value={output}
                readOnly
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
