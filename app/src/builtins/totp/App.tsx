import { useEffect, useState, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { applyThemeFromConfig } from "@/api/theme";
import { MacWindowControls } from "@/components/MacWindowControls";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";

interface TotpToken {
  id: string;
  name: string;
  secret: string;
}

// ── Base32 decode ──
function base32Decode(str: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bits: number[] = [];
  for (const ch of cleaned) {
    const val = alphabet.indexOf(ch);
    if (val === -1) continue;
    for (let i = 4; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i * 8 + j] || 0);
    }
    bytes[i] = byte;
  }
  return bytes;
}

// ── Generate TOTP code using Web Crypto API ──
async function generateTOTP(secret: string): Promise<string> {
  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30);

  // 8-byte big-endian time buffer
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  // BigInt for large time values
  timeView.setUint32(0, Math.floor(timeStep / 0x100000000));
  timeView.setUint32(4, timeStep & 0xffffffff);

  // Decode base32 secret
  const secretBytes = base32Decode(secret);

  // Import key for HMAC-SHA1
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  // Compute HMAC-SHA1
  const hmac = await crypto.subtle.sign("HMAC", key, timeBuffer);
  const hmacArray = new Uint8Array(hmac);

  // Dynamic truncation
  const offset = hmacArray[hmacArray.length - 1] & 0x0f;
  const code =
    ((hmacArray[offset] & 0x7f) << 24) |
    ((hmacArray[offset + 1] & 0xff) << 16) |
    ((hmacArray[offset + 2] & 0xff) << 8) |
    (hmacArray[offset + 3] & 0xff);

  return (code % 1000000).toString().padStart(6, "0");
}

function getRemainingSeconds(): number {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function TotpApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const tokenListRef = useRef<HTMLDivElement>(null);
  const [tokens, setTokens] = useState<TotpToken[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(getRemainingSeconds());
  const [editingToken, setEditingToken] = useState<TotpToken | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotion = useReducedMotion();
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirmDialog();

  // Esc to hide window
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") getCurrentWindow().hide().catch(() => {});
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Apply theme on mount
  useEffect(() => { applyThemeFromConfig(); }, []);

  // Load tokens on mount
  useEffect(() => {
    async function load() {
      try {
        const loaded = await invoke<TotpToken[]>("load_totp_tokens");
        setTokens(loaded);
      } catch (e) {
        console.error("load_totp_tokens failed:", e);
      }
    }
    load();
  }, []);

  // Refresh codes every second
  useEffect(() => {
    const refresh = async () => {
      setRemaining(getRemainingSeconds());
      const newCodes: Record<string, string> = {};
      for (const token of tokens) {
        try {
          newCodes[token.id] = await generateTOTP(token.secret);
        } catch {
          newCodes[token.id] = "------";
        }
      }
      setCodes(newCodes);
    };

    refresh();
    timerRef.current = setInterval(refresh, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tokens]);

  // Persist tokens
  const persistTokens = useCallback(async (updated: TotpToken[]) => {
    setTokens(updated);
    try {
      await invoke("save_totp_tokens", { tokens: updated });
    } catch (e) {
      console.error("save_totp_tokens failed:", e);
    }
  }, []);

  // Add or update token
  const handleSave = useCallback(() => {
    setError("");
    const name = formName.trim();
    const secret = formSecret.trim().replace(/\s/g, "");
    if (!name) {
      setError("请输入令牌名称");
      return;
    }
    if (!secret || secret.length < 8) {
      setError("请输入有效的 Base32 密钥");
      return;
    }
    // Validate base32
    if (!/^[A-Za-z2-7]+=*$/i.test(secret.replace(/=+$/, ""))) {
      setError("密钥必须是有效的 Base32 编码（字母 A-Z 和数字 2-7）");
      return;
    }

    if (editingToken) {
      // Update existing
      const updated = tokens.map(t =>
        t.id === editingToken.id ? { ...t, name, secret } : t
      );
      persistTokens(updated);
    } else {
      // Add new
      const newToken: TotpToken = { id: generateId(), name, secret };
      persistTokens([...tokens, newToken]);
    }
    setShowForm(false);
    setEditingToken(null);
    setFormName("");
    setFormSecret("");
  }, [formName, formSecret, editingToken, tokens, persistTokens]);

  // Delete token
  const handleDelete = useCallback(async (id: string) => {
    const token = tokens.find(t => t.id === id);
    const confirmed = await confirmAction({
      title: "删除令牌",
      message: `将删除“${token?.name ?? "未命名"}”及其保存的 TOTP 密钥。此操作无法撤销。`,
      confirmLabel: "删除令牌",
    });
    if (!confirmed) return;
    const updated = tokens.filter(t => t.id !== id);
    persistTokens(updated);
  }, [confirmAction, tokens, persistTokens]);

  // Edit token
  const handleEdit = useCallback((token: TotpToken) => {
    setEditingToken(token);
    setFormName(token.name);
    setFormSecret(token.secret);
    setShowForm(true);
    setError("");
  }, []);

  // Copy code
  const copyCode = useCallback(async (id: string, code: string) => {
    try {
      await invoke("set_clipboard_text", { text: code });
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {}
  }, []);

  const progress = ((30 - remaining) / 30) * 100;

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(tokenListRef, () => {
    if (!tokenListRef.current) return;
    animateListEnter(Array.from(tokenListRef.current.children), reducedMotion);
  }, [tokens.length, showForm, reducedMotion]);

  const BTN_STYLE: React.CSSProperties = {
    padding: "6px 14px", borderRadius: 7, cursor: "pointer",
    border: "none", fontSize: 12, fontWeight: 600,
    transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease", outline: "none",
  };

  const INPUT_STYLE: React.CSSProperties = {
    width: "100%", padding: "8px 10px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 7, color: "#e8eaf0", fontSize: 13,
    outline: "none", fontFamily: "monospace",
  };

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <div ref={rootRef} className="glass" style={{ width: "min(370px, 100vw)", maxHeight: "min(540px, 100vh)", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Title bar */}
        <div data-tauri-drag-region style={{
          height: 36, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", cursor: "move",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, pointerEvents: "none" }}>
            <BuiltinIcon feature="totp" size={22} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>令牌生成器</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>{remaining}s</span>
            <MacWindowControls
              onClose={() => getCurrentWindow().hide().catch(() => {})}
              onMinimize={() => getCurrentWindow().minimize().catch(() => getCurrentWindow().hide().catch(() => {}))}
              closeTitle="关闭令牌生成器"
              minimizeTitle="最小化令牌生成器"
            />
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 2, background: "rgba(255,255,255,0.05)", position: "relative" }}>
          <div style={{
            height: "100%",
            width: `${progress}%`,
            background: remaining <= 5
              ? "linear-gradient(90deg, rgba(239,68,68,0.8), rgba(239,68,68,0.4))"
              : "linear-gradient(90deg, rgba(59,130,246,0.8), rgba(139,92,246,0.6))",
            transition: "width 1s linear",
          }} />
        </div>

        {/* Token list */}
        <div ref={tokenListRef} className="motion-list motion-scroll-area" style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          {tokens.length === 0 && !showForm && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
              暂无令牌<br />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>点击下方按钮添加</span>
            </div>
          )}

          {/* Add/Edit form (top) */}
          {showForm && (
            <div style={{
              background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(59,130,246,0.15)",
              borderRadius: 10, padding: "10px 12px",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                  {editingToken ? "编辑令牌" : "添加令牌"}
                </span>
                <button
                  onClick={() => { setShowForm(false); setEditingToken(null); setFormName(""); setFormSecret(""); setError(""); }}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 14, padding: 0 }}
                >✕</button>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>名称</span>
                <input
                  style={INPUT_STYLE}
                  placeholder="如: 阿里云、GitHub"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                />
              </div>
              <div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>密钥 (Base32)</span>
                <input
                  style={INPUT_STYLE}
                  placeholder="如: JBSWY3DPEHPK3PXP"
                  value={formSecret}
                  onChange={e => setFormSecret(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                />
              </div>
              {error && (
                <div style={{ fontSize: 11, color: "rgba(239,68,68,0.8)", padding: "2px 0" }}>{error}</div>
              )}
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  style={{ ...BTN_STYLE, background: "rgba(37,99,235,0.80)", color: "#fff" }}
                  onClick={handleSave}
                >{editingToken ? "保存" : "添加"}</button>
              </div>
            </div>
          )}

          {tokens.map(token => {
            const code = codes[token.id] || "------";
            const isCopied = copiedId === token.id;
            return (
              <div key={token.id} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10, padding: "10px 12px",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{token.name}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => handleEdit(token)}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 12, padding: "0 4px" }}
                      title="编辑"
                    >✏️</button>
                    <button
                      onClick={() => handleDelete(token.id)}
                      style={{ background: "none", border: "none", color: "rgba(239,68,68,0.4)", cursor: "pointer", fontSize: 12, padding: "0 4px" }}
                      title="删除"
                    >🗑️</button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: 26, fontWeight: 700, fontFamily: "monospace",
                    letterSpacing: 3, color: isCopied ? "rgba(34,197,94,0.9)" : "rgba(255,255,255,0.92)",
                    transition: "color 0.15s",
                  }}>
                    {code.slice(0, 3)} {code.slice(3)}
                  </span>
                  <button
                    onClick={() => copyCode(token.id, code)}
                    style={{
                      ...BTN_STYLE,
                      background: isCopied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                      color: isCopied ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.6)",
                      fontSize: 11, padding: "4px 10px",
                    }}
                  >{isCopied ? "已复制" : "复制"}</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom bar: add button */}
        {!showForm && (
          <div style={{ padding: "8px 10px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => { setShowForm(true); setEditingToken(null); setFormName(""); setFormSecret(""); setError(""); }}
              style={{
                width: "100%", padding: "8px 0", borderRadius: 8, cursor: "pointer",
                border: "1px dashed rgba(255,255,255,0.18)", background: "transparent",
                color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 500,
                transition: "border-color 120ms ease, color 120ms ease, background-color 120ms ease", outline: "none",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
            >+ 添加令牌</button>
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
