import React, { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { applyThemeFromConfig } from "@/api/theme";
import { MacWindowControls } from "@/components/MacWindowControls";
import { animateListEnter, animatePanelEnter } from "@/motion/presets";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import {
  backendLabel,
  clientLabel,
  desktopLabel,
  hostAvailabilityMessage,
  normalizeProfile,
  visibleHostCredentials,
  type RdpCapabilities,
  type RdpHostInfo,
  type RdpHostStatus,
  type RdpLaunchResult,
  type RemoteDeskProfile,
} from "./rdpModel";

// -----------------------------------------------
// Types
// -----------------------------------------------

interface HostInfo {
  pin: string;
  local_ip: string;
  port: number;
}

interface HostStatus {
  running: boolean;
  connections: number;
  pin: string | null;
}

type Tab = "rdp" | "host" | "connect";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// -----------------------------------------------
// Shared Styles
// -----------------------------------------------

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid var(--theme-border, rgba(255,255,255,0.12))",
  borderRadius: 8,
  padding: "7px 10px",
  color: "rgba(255,255,255,0.85)",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  background: "rgba(99,102,241,0.85)",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  padding: "6px 16px",
};

const btnSecondary: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "rgba(255,255,255,0.7)",
  cursor: "pointer",
  fontSize: 13,
  padding: "6px 16px",
};

const btnDanger: React.CSSProperties = {
  background: "rgba(239,68,68,0.75)",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  padding: "6px 16px",
};

const cardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: "10px 12px",
};

// -----------------------------------------------
// RDP Profiles Tab
// -----------------------------------------------

function RdpTab() {
  const profileListRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<RemoteDeskProfile[]>([]);
  const [editing, setEditing] = useState<RemoteDeskProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [password, setPassword] = useState("");
  const [launching, setLaunching] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [rdpCaps, setRdpCaps] = useState<RdpCapabilities | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    invoke<RemoteDeskProfile[]>("load_remotedesk_profiles")
      .then(items => setProfiles(items.map(normalizeProfile)))
      .catch(() => {});
    invoke<RdpCapabilities>("get_rdp_capabilities")
      .then(setRdpCaps)
      .catch(() => setRdpCaps(null));
  }, []);

  function startNew() {
    setEditing({
      id: generateId(),
      name: "",
      host: "",
      port: 3389,
      username: "",
      client_mode: "auto",
      has_password: false,
    });
    setPassword("");
    setIsNew(true);
  }

  function startEdit(p: RemoteDeskProfile) {
    setEditing({ ...p });
    setPassword("");
    setIsNew(false);
  }

  async function handleSave() {
    if (!editing) return;
    let profile = { ...editing };

    if (password) {
      await invoke("save_remotedesk_password", { id: profile.id, password });
      profile = { ...profile, has_password: true };
    }

    const updated = isNew
      ? [...profiles, profile]
      : profiles.map(p => p.id === profile.id ? profile : p);

    await invoke("save_remotedesk_profiles", { profiles: updated });
    setProfiles(updated);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const p = profiles.find(x => x.id === id);
    if (!window.confirm(`删除远程桌面连接「${p?.name || p?.host || "未命名"}」？`)) return;
    if (p?.has_password) {
      await invoke("delete_remotedesk_password", { id }).catch(() => {});
    }
    const updated = profiles.filter(x => x.id !== id);
    await invoke("save_remotedesk_profiles", { profiles: updated });
    setProfiles(updated);
  }

  async function handleLaunch(id: string) {
    setLaunching(id);
    setMsg("");
    try {
      const result = await invoke<RdpLaunchResult>("launch_rdp", { id });
      setMsg("已启动 " + clientLabel(result.client));
    } catch (e) {
      setMsg(String(e));
    }
    setLaunching(null);
  }

  useGsapContext(profileListRef, () => {
    if (!profileListRef.current) return;
    animateListEnter(Array.from(profileListRef.current.children), reducedMotion);
  }, [profiles.length, reducedMotion]);

  if (editing) {
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--theme-bg-solid, #fff)", marginBottom: 4 }}>
          {isNew ? "新建 RDP 连接" : "编辑连接"}
        </div>
        {(["name", "host", "username"] as const).map(field => (
          <div key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              {field === "name" ? "连接名称" : field === "host" ? "主机地址" : "用户名"}
            </label>
            <input
              value={editing[field]}
              onChange={e => setEditing({ ...editing, [field]: e.target.value })}
              style={inputStyle}
            />
          </div>
        ))}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>端口</label>
            <input
              type="number"
              value={editing.port}
              onChange={e => setEditing({ ...editing, port: Number(e.target.value) })}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              密码 {editing.has_password ? "(已存储，留空不修改)" : ""}
            </label>
            <input
              type="password"
              value={password}
              placeholder={editing.has_password ? "留空不修改" : "可选"}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>连接客户端</label>
          <select
            value={editing.client_mode}
            onChange={event => setEditing({
              ...editing,
              client_mode: event.target.value as RemoteDeskProfile["client_mode"],
            })}
            style={inputStyle}
          >
            <option value="auto">自动选择</option>
            <option value="system">系统 RDP</option>
            <option value="free_rdp">FreeRDP</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={handleSave} style={btnPrimary}>保存</button>
          <button onClick={() => setEditing(null)} style={btnSecondary}>取消</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          {profiles.length} 个连接
        </span>
        <button onClick={startNew} style={btnPrimary}>+ 新建</button>
      </div>

      {rdpCaps && !rdpCaps.recommendedClient && (
        <div style={{ color: "#fbbf24", fontSize: 12, lineHeight: 1.6 }}>
          未检测到 RDP 客户端。安装 FreeRDP 后即可从此处连接。
        </div>
      )}

      {profiles.length === 0 && (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "24px 0" }}>
          暂无 RDP 连接，点击「新建」添加
        </div>
      )}

      <div ref={profileListRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {profiles.map(p => (
        <div key={p.id} style={cardStyle}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{p.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
              {p.username}@{p.host}:{p.port}
              <span style={{ marginLeft: 6, color: "rgba(255,255,255,0.32)" }}>
                {clientLabel(p.client_mode)}
              </span>
              {p.has_password && <span style={{ marginLeft: 6, color: "#4ade80" }}>🔑</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => handleLaunch(p.id)}
              disabled={launching === p.id}
              style={{ ...btnPrimary, padding: "4px 12px", fontSize: 12 }}
            >
              {launching === p.id ? "启动中…" : "连接"}
            </button>
            <button onClick={() => startEdit(p)} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 12 }}>编辑</button>
            <button onClick={() => handleDelete(p.id)} style={{ ...btnDanger, padding: "4px 10px", fontSize: 12 }}>删除</button>
          </div>
        </div>
        ))}
      </div>

      {msg && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>{msg}</div>
      )}
    </div>
  );
}

// -----------------------------------------------
// Host Mode Tab
// -----------------------------------------------

function HostTab() {
  const [rdpCaps, setRdpCaps] = useState<RdpCapabilities | null>(null);
  const [rdpStatus, setRdpStatus] = useState<RdpHostStatus>({
    running: false,
    backend: null,
    desktopSession: "unknown",
    address: null,
    port: null,
    tls: false,
    nla: false,
    errorCode: null,
    errorMessage: null,
  });
  const [rdpHostInfo, setRdpHostInfo] = useState<RdpHostInfo | null>(null);
  const [rdpStarting, setRdpStarting] = useState(false);
  const [rdpError, setRdpError] = useState("");
  const [status, setStatus] = useState<HostStatus>({ running: false, connections: 0, pin: null });
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  // frp settings (persisted in localStorage)
  const [frpcPath, setFrpcPath] = useState(() => localStorage.getItem("frpc_path") ?? "frpc.exe");
  const [vpsIp, setVpsIp] = useState(() => localStorage.getItem("frp_vps_ip") ?? "");
  const [vpsPort, setVpsPort] = useState(() => Number(localStorage.getItem("frp_vps_port") ?? "7000"));
  const [remotePort, setRemotePort] = useState(() => Number(localStorage.getItem("frp_remote_port") ?? "29090"));
  const [frpRunning, setFrpRunning] = useState(false);
  const [frpError, setFrpError] = useState("");
  const [showFrpConfig, setShowFrpConfig] = useState(false);

  // ngrok
  const [ngrokRunning, setNgrokRunning] = useState(false);
  const [ngrokAddr, setNgrokAddr] = useState<string | null>(null);
  const [ngrokError, setNgrokError] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(() => {
    invoke<RdpHostStatus>("get_rdp_host_status").then(next => {
      setRdpStatus(next);
      if (!next.running) setRdpHostInfo(null);
    }).catch(() => {});
    invoke<HostStatus>("get_remotedesk_host_status").then(setStatus).catch(() => {});
    invoke<{ running: boolean }>("get_frp_status").then(s => setFrpRunning(s.running)).catch(() => {});
    invoke<{ running: boolean; public_addr: string | null; error: string | null }>("get_ngrok_status").then(s => {
      setNgrokRunning(s.running);
      if (s.public_addr) setNgrokAddr(s.public_addr);
      else if (!s.running) setNgrokAddr(null);
      if (s.error) { setNgrokError(s.error); setNgrokRunning(false); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    invoke<RdpCapabilities>("get_rdp_capabilities")
      .then(setRdpCaps)
      .catch(() => setRdpCaps(null));
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  function save(key: string, val: string) { localStorage.setItem(key, val); }

  async function handleRdpStart() {
    setRdpStarting(true);
    setRdpError("");
    try {
      const info = await invoke<RdpHostInfo>("start_rdp_host");
      setRdpHostInfo(info);
      setRdpStatus(current => ({
        ...current,
        running: true,
        backend: info.backend,
        desktopSession: info.desktopSession,
        address: info.address,
        port: info.port,
        tls: info.tls,
        nla: info.nla,
        errorCode: null,
        errorMessage: null,
      }));
    } catch (error) {
      setRdpError(String(error));
    }
    setRdpStarting(false);
  }

  async function handleRdpStop() {
    await invoke("stop_rdp_host").catch(error => setRdpError(String(error)));
    setRdpHostInfo(null);
    setRdpStatus(current => ({
      ...current,
      running: false,
      backend: null,
      address: null,
      port: null,
      tls: false,
      nla: false,
    }));
  }

  async function handleStart() {
    setStarting(true); setError("");
    try {
      const info = await invoke<HostInfo>("start_remotedesk_host", { port: null });
      setHostInfo(info);
    } catch (e) { setError(String(e)); }
    setStarting(false);
  }

  async function handleStop() {
    await invoke("stop_remotedesk_host").catch(() => {});
    setHostInfo(null);
  }

  async function handleFrpStart() {
    setFrpError("");
    const localPort = hostInfo?.port ?? 19090;
    try {
      await invoke("start_frp", {
        frpcPath,
        vpsIp,
        vpsServerPort: vpsPort,
        remotePort,
        localPort,
      });
      setFrpRunning(true);
    } catch (e) { setFrpError(String(e)); }
  }

  async function handleFrpStop() {
    await invoke("stop_frp").catch(() => {});
    setFrpRunning(false);
  }

  async function handleNgrokStart() {
    setNgrokError("");
    setNgrokAddr(null);
    setNgrokRunning(true); // optimistic
    const localPort = hostInfo?.port ?? 19090;
    try {
      await invoke("start_ngrok", { localPort });
    } catch (e) {
      setNgrokError(String(e));
      setNgrokRunning(false);
    }
  }

  async function handleNgrokStop() {
    await invoke("stop_ngrok").catch(() => {});
    setNgrokRunning(false);
    setNgrokAddr(null);
  }

  function copy(text: string) { navigator.clipboard.writeText(text).catch(() => {}); }

  const localPort = hostInfo?.port ?? 19090;
  const publicWs = vpsIp && frpRunning ? `ws://${vpsIp}:${remotePort}` : null;
  const publicHttp = vpsIp && frpRunning ? `http://${vpsIp}:${remotePort}` : null;
  const rdpCredentials = visibleHostCredentials(rdpStatus, rdpHostInfo);
  const capabilityMessage = hostAvailabilityMessage(rdpCaps?.hostErrorCode);
  const runtimeMessage = hostAvailabilityMessage(rdpStatus.errorCode)
    || rdpStatus.errorMessage
    || rdpError.split(":").slice(1).join(":").trim()
    || rdpError;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>
              RDP 当前桌面
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {desktopLabel(rdpStatus.desktopSession || rdpCaps?.desktopSession || "unknown")}
            </div>
          </div>
          <span style={{
            flexShrink: 0,
            padding: "2px 7px",
            borderRadius: 5,
            background: rdpStatus.running ? "rgba(74,222,128,0.14)" : "rgba(255,255,255,0.06)",
            color: rdpStatus.running ? "#4ade80" : "rgba(255,255,255,0.38)",
            fontSize: 10,
          }}>
            {rdpStatus.running ? "运行中" : backendLabel(rdpCaps?.recommendedHost ?? null)}
          </span>
        </div>

        {!rdpStatus.running ? (
          <button
            onClick={handleRdpStart}
            disabled={rdpStarting || !rdpCaps?.recommendedHost}
            style={{
              ...btnPrimary,
              width: "100%",
              padding: "10px 0",
              opacity: rdpStarting || !rdpCaps?.recommendedHost ? 0.45 : 1,
            }}
          >
            {rdpStarting ? "启动中…" : "开启 RDP 主机"}
          </button>
        ) : (
          <button onClick={handleRdpStop} style={{ ...btnDanger, width: "100%", padding: "10px 0" }}>
            停止 RDP 主机
          </button>
        )}

        {!rdpStatus.running && capabilityMessage && (
          <div style={{ color: "#fbbf24", fontSize: 11, lineHeight: 1.6 }}>{capabilityMessage}</div>
        )}
        {runtimeMessage && (
          <div style={{ color: "#f87171", fontSize: 11, lineHeight: 1.6 }}>{runtimeMessage}</div>
        )}

        {rdpStatus.running && rdpStatus.address && rdpStatus.port && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <InfoRow
              label="RDP 地址"
              value={rdpStatus.address + ":" + rdpStatus.port}
              onCopy={copy}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <InfoRow label="主机后端" value={backendLabel(rdpStatus.backend)} />
              <InfoRow
                label="连接安全"
                value={(rdpStatus.tls ? "TLS" : "无 TLS") + " · " + (rdpStatus.nla ? "NLA" : "无 NLA")}
              />
            </div>
            {rdpCredentials && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <InfoRow label="临时用户名" value={rdpCredentials.username} onCopy={copy} />
                <InfoRow label="临时密码" value={rdpCredentials.password} onCopy={copy} />
              </div>
            )}
          </div>
        )}
      </section>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.58)" }}>
          JPEG/WebSocket 兼容模式
        </div>
        <div style={{ marginTop: 2, fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
          仅在目标系统没有可用 RDP 后端时手动使用
        </div>
      </div>

      {/* Compatibility host mode control */}
      {!status.running ? (
        <button onClick={handleStart} disabled={starting} style={{ ...btnPrimary, width: "100%", padding: "10px 0" }}>
          {starting ? "启动中…" : "🖥️ 开启主机模式"}
        </button>
      ) : (
        <button onClick={handleStop} style={{ ...btnDanger, width: "100%", padding: "10px 0" }}>
          停止主机模式
        </button>
      )}
      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}

      {/* Connection info */}
      {(status.running || hostInfo) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <InfoRow label="PIN 码" value={status.pin ?? hostInfo?.pin ?? "—"} onCopy={copy} large />
          <InfoRow label="局域网地址" value={`ws://${hostInfo?.local_ip ?? "…"}:${localPort}`} onCopy={copy} />
          {publicWs && <InfoRow label="公网 WebSocket（frp）" value={publicWs} onCopy={copy} />}
          {publicHttp && <InfoRow label="公网手机访问（frp）" value={publicHttp} onCopy={copy} />}
          {ngrokAddr && <InfoRow label="公网地址（ngrok WebSocket）" value={ngrokAddr.replace('https://', 'wss://').replace('http://', 'ws://')} onCopy={copy} />}
          {ngrokAddr && <InfoRow label="手机访问（ngrok）" value={ngrokAddr} onCopy={copy} />}
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            在线连接数：<span style={{ color: "#4ade80" }}>{status.connections}</span>
          </div>
        </div>
      )}

      {/* ngrok — no VPS needed */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>🚇 ngrok 一键穿透</span>
            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
              无需 VPS
            </span>
            <span style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 4,
              background: ngrokRunning ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
              color: ngrokRunning ? "#4ade80" : "rgba(255,255,255,0.3)",
            }}>
              {ngrokAddr ? "● 已就绪" : ngrokRunning ? "⟳ 获取地址中…" : "○ 未启动"}
            </span>
          </div>
        </div>

        {ngrokError && <div style={{ color: "#f87171", fontSize: 11 }}>{ngrokError}</div>}

        {!ngrokRunning ? (
          <button
            onClick={handleNgrokStart}
            disabled={!status.running}
            style={{ ...btnPrimary, width: "100%", padding: "8px 0", opacity: !status.running ? 0.4 : 1 }}
            title={!status.running ? "请先开启主机模式" : ""}
          >
            一键获取公网地址
          </button>
        ) : (
          <button onClick={handleNgrokStop} style={{ ...btnSecondary, width: "100%", padding: "8px 0" }}>
            停止 ngrok
          </button>
        )}

        {!ngrokRunning && !ngrokAddr && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>
            需要先安装 ngrok：<a href="https://ngrok.com/download" target="_blank" style={{ color: "#818cf8", textDecoration: "none" }}>ngrok.com/download</a>，下载后将 ngrok.exe 加入 PATH 即可
          </div>
        )}
      </div>

      {/* frp section */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>公网穿透 (frp)</span>
            <span style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 4,
              background: frpRunning ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
              color: frpRunning ? "#4ade80" : "rgba(255,255,255,0.3)",
            }}>
              {frpRunning ? "● 运行中" : "○ 未启动"}
            </span>
          </div>
          <button
            onClick={() => setShowFrpConfig(v => !v)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12 }}
          >
            {showFrpConfig ? "▾ 收起" : "▸ 配置"}
          </button>
        </div>

        {showFrpConfig && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>frpc.exe 路径</label>
              <input value={frpcPath} onChange={e => { setFrpcPath(e.target.value); save("frpc_path", e.target.value); }} style={inputStyle} placeholder="C:\tools\frpc.exe 或 frpc.exe（已加入 PATH）" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 3, display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>VPS 地址</label>
                <input value={vpsIp} onChange={e => { setVpsIp(e.target.value); save("frp_vps_ip", e.target.value); }} style={inputStyle} placeholder="1.2.3.4" />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>frps 端口</label>
                <input type="number" value={vpsPort} onChange={e => { setVpsPort(Number(e.target.value)); save("frp_vps_port", e.target.value); }} style={inputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>公网端口</label>
                <input type="number" value={remotePort} onChange={e => { setRemotePort(Number(e.target.value)); save("frp_remote_port", e.target.value); }} style={inputStyle} />
              </div>
            </div>
          </div>
        )}

        {frpError && <div style={{ color: "#f87171", fontSize: 11 }}>{frpError}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          {!frpRunning ? (
            <button
              onClick={handleFrpStart}
              disabled={!vpsIp || !status.running}
              style={{ ...btnPrimary, flex: 1, padding: "8px 0", opacity: (!vpsIp || !status.running) ? 0.4 : 1 }}
              title={!status.running ? "请先开启主机模式" : !vpsIp ? "请配置 VPS 地址" : ""}
            >
              🔗 启动 frp 穿透
            </button>
          ) : (
            <button onClick={handleFrpStop} style={{ ...btnDanger, flex: 1, padding: "8px 0" }}>
              断开 frp
            </button>
          )}
          {!showFrpConfig && (
            <button onClick={() => setShowFrpConfig(true)} style={{ ...btnSecondary, padding: "8px 12px", fontSize: 11 }}>
              ⚙
            </button>
          )}
        </div>

        {!vpsIp && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
            需要 VPS 运行 frps：<code style={{ color: "rgba(255,255,255,0.45)" }}>frps -c frps.ini</code>
            （frps.ini 仅需 <code style={{ color: "rgba(255,255,255,0.45)" }}>[common] bind_port=7000</code>）
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, onCopy, large }: { label: string; value: string; onCopy?: (v: string) => void; large?: boolean }) {
  const copyable = Boolean(onCopy);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{label}</div>
      <div
        onClick={() => onCopy?.(value)}
        style={{
          fontFamily: "monospace",
          fontSize: large ? 22 : 13,
          fontWeight: large ? 700 : 400,
          color: "rgba(255,255,255,0.85)",
          background: "rgba(255,255,255,0.07)",
          borderRadius: 6,
          padding: "6px 10px",
          cursor: copyable ? "pointer" : "default",
          letterSpacing: large ? 4 : 1,
        }}
        title={copyable ? "点击复制" : undefined}
      >
        {value}
      </div>
    </div>
  );
}

// -----------------------------------------------
// Connect Tab
// -----------------------------------------------

function ConnectTab() {
  const [addr, setAddr] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [fps, setFps] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef(0);
  const fpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenSizeRef = useRef({ w: 1920, h: 1080 });
  const hasRemoteScreenSizeRef = useRef(false);
  const lastMoveRef = useRef(0);

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("idle");
    exitFullscreen();
    hasRemoteScreenSizeRef.current = false;
    if (fpsIntervalRef.current) {
      clearInterval(fpsIntervalRef.current);
      fpsIntervalRef.current = null;
    }
    setFps(0);
  }

  async function enterFullscreen() {
    try {
      await getCurrentWindow().setFullscreen(true);
      setIsFullscreen(true);
      document.body.dataset.remoteDeskFullscreen = "true";
    } catch (e) {
      console.error("enter fullscreen failed:", e);
    }
  }

  async function exitFullscreen() {
    try {
      await getCurrentWindow().setFullscreen(false);
    } catch (e) {
      console.error("exit fullscreen failed:", e);
    }
    setIsFullscreen(false);
    delete document.body.dataset.remoteDeskFullscreen;
  }

  function connect() {
    if (!addr.trim()) { setErrorMsg("请输入地址"); return; }
    if (!pin.trim()) { setErrorMsg("请输入 PIN"); return; }
    setErrorMsg("");
    setStatus("connecting");

    const wsUrl = addr.startsWith("ws://") || addr.startsWith("wss://")
      ? addr
      : `ws://${addr}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => { ws.send(JSON.stringify({ pin: pin.trim() })); };

    ws.onmessage = async (e) => {
      if (typeof e.data === "string") {
        const msg = JSON.parse(e.data);
        if (msg.error) {
          setErrorMsg(msg.error === "invalid_pin" ? "PIN 码错误" : msg.error);
          setStatus("error");
          ws.close();
          return;
        }
        if (msg.ok) {
          // Store REAL screen dimensions for accurate mouse coordinate mapping
          if (msg.screen_w && msg.screen_h) {
            screenSizeRef.current = { w: msg.screen_w, h: msg.screen_h };
            hasRemoteScreenSizeRef.current = true;
          }
          setStatus("connected");
          fpsIntervalRef.current = setInterval(() => {
            setFps(frameCountRef.current);
            frameCountRef.current = 0;
          }, 1000);
        }
        return;
      }
      // Binary = JPEG 帧 — use createImageBitmap for GPU-accelerated decode
      const bitmap = await createImageBitmap(new Blob([e.data], { type: "image/jpeg" }));
      frameCountRef.current++;
      if (!hasRemoteScreenSizeRef.current) {
        screenSizeRef.current = { w: bitmap.width, h: bitmap.height };
      }
      const canvas = canvasRef.current;
      if (!canvas) { bitmap.close(); return; }
      const ctx = canvas.getContext("2d");
      if (!ctx) { bitmap.close(); return; }
      if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
      if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    };

    ws.onerror = () => { setErrorMsg("连接失败"); setStatus("error"); };
    ws.onclose = () => {
      if (fpsIntervalRef.current) { clearInterval(fpsIntervalRef.current); fpsIntervalRef.current = null; }
      setStatus(prev => prev === "connecting" ? "error" : "idle");
    };
  }

  function sendMouse(e: React.MouseEvent<HTMLCanvasElement>, type: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (type === "mousemove") {
      const now = Date.now();
      if (now - lastMoveRef.current < 50) return;
      lastMoveRef.current = now;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const remoteAspect = screenSizeRef.current.w / screenSizeRef.current.h;
    const rectAspect = rect.width / rect.height;
    const displayWidth = rectAspect > remoteAspect ? rect.height * remoteAspect : rect.width;
    const displayHeight = rectAspect > remoteAspect ? rect.height : rect.width / remoteAspect;
    const offsetX = (rect.width - displayWidth) / 2;
    const offsetY = (rect.height - displayHeight) / 2;
    const localX = e.clientX - rect.left - offsetX;
    const localY = e.clientY - rect.top - offsetY;
    const x = Math.max(0, Math.min(
      screenSizeRef.current.w - 1,
      Math.round(localX * screenSizeRef.current.w / displayWidth),
    ));
    const y = Math.max(0, Math.min(
      screenSizeRef.current.h - 1,
      Math.round(localY * screenSizeRef.current.h / displayHeight),
    ));
    ws.send(JSON.stringify({ type, x, y, button: e.button }));
  }

  function sendKey(e: KeyboardEvent, type: "keydown" | "keyup") {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || status !== "connected") return;
    if (document.body.dataset.remoteDeskFullscreen && e.key === "Escape") return;
    const target = e.target as HTMLElement | null;
    const isTyping = target && (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable
    );
    if (isTyping) return;
    e.preventDefault();
    ws.send(JSON.stringify({
      type,
      key: e.key,
      code: e.code,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      repeat: e.repeat,
    }));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !document.body.dataset.remoteDeskFullscreen) return;
      e.preventDefault();
      exitFullscreen();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (status !== "connected") return;
    const onKeyDown = (event: KeyboardEvent) => sendKey(event, "keydown");
    const onKeyUp = (event: KeyboardEvent) => sendKey(event, "keyup");
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [status]);

  useEffect(() => () => disconnect(), []);

  const canvasStyle: React.CSSProperties = isFullscreen ? {
    width: "100vw",
    height: "100vh",
    maxWidth: "100vw",
    maxHeight: "100vh",
    objectFit: "contain",
    display: status === "connected" ? "block" : "none",
    background: "#000",
    cursor: "crosshair",
  } : {
    width: "100%",
    borderRadius: 8,
    border: "1px solid var(--theme-border, rgba(255,255,255,0.1))",
    display: status === "connected" ? "block" : "none",
    background: "#000",
    cursor: "crosshair",
  };

  return (
    <div style={isFullscreen ? {
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    } : { display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
      {status !== "connected" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>主机地址 (IP:Port)</label>
            <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="192.168.1.x:19090" style={inputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>PIN 码</label>
            <input value={pin} onChange={e => setPin(e.target.value)} placeholder="6 位数字" maxLength={6}
              style={{ ...inputStyle, letterSpacing: 4, fontSize: 18, textAlign: "center" }} />
          </div>
          {errorMsg && <div style={{ color: "#f87171", fontSize: 12 }}>{errorMsg}</div>}
          <button onClick={connect} disabled={status === "connecting"}
            style={{ ...btnPrimary, width: "100%", padding: "10px 0" }}>
            {status === "connecting" ? "连接中…" : "连接"}
          </button>
        </>
      )}
      {status === "connected" && (
        <div style={isFullscreen ? {
          position: "fixed",
          top: 14,
          left: 14,
          right: 14,
          zIndex: 10000,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pointerEvents: "none",
        } : { display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#4ade80" }}>● 已连接 · {fps} fps</span>
          <div style={{ display: "flex", gap: 8, pointerEvents: "auto" }}>
            <button
              onClick={isFullscreen ? exitFullscreen : enterFullscreen}
              style={{ ...btnSecondary, padding: "4px 12px", fontSize: 12 }}
            >
              {isFullscreen ? "退出全屏" : "全屏"}
            </button>
            <button onClick={disconnect} style={{ ...btnDanger, padding: "4px 12px", fontSize: 12 }}>断开</button>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        tabIndex={0}
        onMouseMove={e => sendMouse(e, "mousemove")}
        onMouseDown={e => { e.preventDefault(); sendMouse(e, "mousedown"); }}
        onMouseUp={e => sendMouse(e, "mouseup")}
        onContextMenu={e => e.preventDefault()}
      />
    </div>
  );
}

// -----------------------------------------------
// Main App
// -----------------------------------------------

export function RemoteDeskApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("rdp");
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    applyThemeFromConfig();

    const win = getCurrentWindow();
    const unlisten = win.listen("tauri://window-close-requested", () => {
      win.hide();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.body.dataset.remoteDeskFullscreen) win.hide();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unlisten.then(f => f());
    };
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "rdp", label: "连接" },
    { id: "host", label: "我的设备" },
    { id: "connect", label: "兼容连接" },
  ];

  useGsapContext(rootRef, () => {
    if (!rootRef.current) return;
    animatePanelEnter(rootRef.current, reducedMotion);
  }, [reducedMotion]);

  useGsapContext(tabContentRef, () => {
    if (!tabContentRef.current) return;
    animateListEnter(Array.from(tabContentRef.current.children), reducedMotion);
  }, [tab, reducedMotion]);

  return (
    <div
      ref={rootRef}
      className="glass"
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 14,
      }}
    >
      {/* Title bar (draggable) */}
      <div
        data-tauri-drag-region
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px 0",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>🖥️ 远程桌面</span>
        <MacWindowControls
          onClose={() => getCurrentWindow().hide()}
          onMinimize={() => getCurrentWindow().minimize().catch(() => getCurrentWindow().hide())}
          closeTitle="关闭远程桌面"
          minimizeTitle="最小化远程桌面"
        />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "10px 16px 0", flexShrink: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "5px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: tab === t.id ? 600 : 400,
              background: tab === t.id ? "rgba(255,255,255,0.14)" : "transparent",
              color: tab === t.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        ref={tabContentRef}
        className="motion-list motion-scroll-area"
        style={{
          flex: 1,
          overflowX: "hidden",
          minHeight: 0,
        }}
      >
        {tab === "rdp" && <RdpTab />}
        {tab === "host" && <HostTab />}
        <div style={{ display: tab === "connect" ? "block" : "none" }}><ConnectTab /></div>
      </div>
    </div>
  );
}
