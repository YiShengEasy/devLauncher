import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyThemeFromConfig } from "@/api/theme";
import "@xterm/xterm/css/xterm.css";

function makeSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** UTF-8 string → base64 (handles all Unicode) */
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

export function TerminalApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string>(makeSessionId());
  const spawnedRef = useRef(false);
  const [title, setTitle] = useState("终端");

  useEffect(() => {
    applyThemeFromConfig();

    const sessionId = sessionIdRef.current;
    const container = containerRef.current!;

    // ── xterm setup ────────────────────────────────────────────────────────────
    const term = new Terminal({
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      theme: {
        background: "#0e101c",
        foreground: "#d0d0d0",
        cursor: "#00ff9f",
        cursorAccent: "#0e101c",
        selectionBackground: "rgba(255,255,255,0.15)",
        black: "#1c1e2a",
        red: "#ff5f7e",
        green: "#5fffaf",
        yellow: "#ffe06b",
        blue: "#5fafff",
        magenta: "#d78fff",
        cyan: "#5fd7ff",
        white: "#d0d0d0",
        brightBlack: "#4a4c5e",
        brightRed: "#ff8fa0",
        brightGreen: "#87ffca",
        brightYellow: "#ffee99",
        brightBlue: "#87cfff",
        brightMagenta: "#e4aaff",
        brightCyan: "#87e7ff",
        brightWhite: "#ffffff",
      },
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();
    term.focus();

    termRef.current = term;
    fitRef.current = fitAddon;

    // ── PTY spawn ──────────────────────────────────────────────────────────────
    const shell = navigator.platform.startsWith("Win") ? "powershell.exe" : "bash";
    const spawnPty = (cmd: string, args: string[]) => {
      if (spawnedRef.current) return;
      spawnedRef.current = true;
      invoke("terminal_spawn", {
        sessionId,
        cmd,
        args,
        cols: term.cols,
        rows: term.rows,
      }).catch((e) => {
        term.write(`\r\n\x1b[31m[spawn error] ${e}\x1b[0m\r\n`);
      });
    };

    // Check for a pending command (e.g. SSH/script initiated from execute_action)
    invoke<string | null>("terminal_take_pending_cmd").then((pendingCmd) => {
      if (pendingCmd) {
        // Route through a shell so inline commands, arguments, and quotes are preserved.
        if (navigator.platform.startsWith("Win")) {
          spawnPty("powershell.exe", ["-NoExit", "-Command", pendingCmd]);
        } else {
          spawnPty("bash", ["-lc", `${pendingCmd}; exec bash`]);
        }
        setTitle(pendingCmd.slice(0, 40));
      } else {
        spawnPty(shell, []);
      }
    });

    // ── Receive PTY output ────────────────────────────────────────────────────
    const unlistenData = listen<string>(`terminal-data-${sessionId}`, (e) => {
      // payload is base64-encoded bytes
      const bytes = Uint8Array.from(atob(e.payload), (c) => c.charCodeAt(0));
      term.write(bytes);
    });

    const unlistenExit = listen(`terminal-exit-${sessionId}`, () => {
      term.write("\r\n\x1b[90m[进程已退出] 按 Ctrl+W 关闭窗口\x1b[0m\r\n");
      spawnedRef.current = false;
    });

    // ── Receive "run command" event from execute_action ───────────────────────
    const unlistenRun = listen<string>("terminal-execute", (e) => {
      const data = toBase64(e.payload + "\r");
      invoke("terminal_write", { sessionId, data }).catch(console.error);
    });

    // ── Send keystrokes to PTY ────────────────────────────────────────────────
    term.onData((data) => {
      const encoded = toBase64(data);
      invoke("terminal_write", { sessionId, data: encoded }).catch(console.error);
    });

    // ── Resize ────────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      invoke("terminal_resize", {
        sessionId,
        cols: term.cols,
        rows: term.rows,
      }).catch(console.error);
    });
    ro.observe(container);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    const keyHandler = (e: KeyboardEvent) => {
      // Ctrl+W → hide window
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        getCurrentWindow().hide().catch(() => {});
      }
    };
    window.addEventListener("keydown", keyHandler);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      ro.disconnect();
      window.removeEventListener("keydown", keyHandler);
      unlistenData.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      unlistenRun.then((fn) => fn());
      invoke("terminal_kill", { sessionId }).catch(console.error);
      term.dispose();
    };
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0e101c",
        overflow: "hidden",
      }}
      data-tauri-drag-region
    >
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: "rgba(255,255,255,0.04)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
          userSelect: "none",
        }}
        data-tauri-drag-region
      >
        <span style={{ fontSize: 12, color: "#888", fontFamily: "sans-serif" }}>
          🖥️ {title}
        </span>
        <button
          onClick={() => getCurrentWindow().hide().catch(() => {})}
          style={{
            background: "none",
            border: "none",
            color: "#666",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: "2px 6px",
            borderRadius: 4,
          }}
          title="关闭 (Ctrl+W)"
        >
          ×
        </button>
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: "4px 8px",
          overflow: "hidden",
          // xterm.js manages its own scroll
        }}
      />
    </div>
  );
}
