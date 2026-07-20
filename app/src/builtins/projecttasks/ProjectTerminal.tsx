import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { terminalChangeDirectoryCommand } from "./terminalCommand";
import "@xterm/xterm/css/xterm.css";

type ShellSpec = [string, string[]];

export interface ProjectTerminalHandle {
  run: (command: string) => Promise<void>;
  focus: () => void;
}

interface ProjectTerminalProps {
  cwd: string;
}

function makeSessionId(): string {
  return `projecttasks-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function shellFallback(): ShellSpec {
  return navigator.platform.startsWith("Win")
    ? ["powershell.exe", []]
    : ["/bin/zsh", ["-l"]];
}

export const ProjectTerminal = forwardRef<ProjectTerminalHandle, ProjectTerminalProps>(
  function ProjectTerminal({ cwd }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const readyRef = useRef(false);
    const [ready, setReady] = useState(false);

    useImperativeHandle(ref, () => ({
      async run(command: string) {
        const sessionId = sessionIdRef.current;
        if (!sessionId || !readyRef.current) {
          throw new Error("项目终端仍在启动，请稍后重试");
        }
        await invoke("terminal_write", {
          sessionId,
          data: toBase64(`${command.trimEnd()}\r`),
        });
        terminalRef.current?.focus();
      },
      focus() {
        terminalRef.current?.focus();
      },
    }), []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container || !cwd.trim()) return;

      const sessionId = makeSessionId();
      const terminal = new Terminal({
        fontSize: 12,
        lineHeight: 1.2,
        fontFamily: "'SFMono-Regular', 'Cascadia Code', Consolas, monospace",
        allowTransparency: true,
        cursorBlink: true,
        scrollback: 4000,
        theme: {
          background: "rgba(4,7,12,0.82)",
          foreground: "#d4d9e3",
          cursor: "#5eead4",
          cursorAccent: "#07110f",
          selectionBackground: "rgba(94,234,212,0.18)",
          black: "#111827",
          red: "#fb7185",
          green: "#5eead4",
          yellow: "#fbbf24",
          blue: "#60a5fa",
          magenta: "#c084fc",
          cyan: "#38bdf8",
          white: "#e5e7eb",
          brightBlack: "#64748b",
          brightRed: "#fda4af",
          brightGreen: "#99f6e4",
          brightYellow: "#fde68a",
          brightBlue: "#93c5fd",
          brightMagenta: "#d8b4fe",
          brightCyan: "#7dd3fc",
          brightWhite: "#ffffff",
        },
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);
      fitAddon.fit();

      terminalRef.current = terminal;
      sessionIdRef.current = sessionId;
      readyRef.current = false;
      setReady(false);

      let disposed = false;
      let unlistenData: (() => void) | null = null;
      let unlistenExit: (() => void) | null = null;

      const inputSubscription = terminal.onData((data) => {
        if (!readyRef.current) return;
        invoke("terminal_write", {
          sessionId,
          data: toBase64(data),
        }).catch(() => {});
      });

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        if (!readyRef.current) return;
        invoke("terminal_resize", {
          sessionId,
          cols: terminal.cols,
          rows: terminal.rows,
        }).catch(() => {});
      });
      resizeObserver.observe(container);

      void (async () => {
        try {
          [unlistenData, unlistenExit] = await Promise.all([
            listen<string>(`terminal-data-${sessionId}`, (event) => {
              const bytes = Uint8Array.from(atob(event.payload), (character) => character.charCodeAt(0));
              terminal.write(bytes);
            }),
            listen(`terminal-exit-${sessionId}`, () => {
              readyRef.current = false;
              setReady(false);
              terminal.write("\r\n\x1b[90m[终端进程已退出]\x1b[0m\r\n");
            }),
          ]);
          if (disposed) {
            unlistenData();
            unlistenExit();
            return;
          }
          const [cmd, args] = await invoke<ShellSpec>("get_default_shell").catch(shellFallback);
          if (disposed) return;
          await invoke("terminal_spawn", {
            sessionId,
            cmd,
            args,
            cols: terminal.cols,
            rows: terminal.rows,
            cwd,
          });
          if (disposed) return;
          const changeDirectoryCommand = terminalChangeDirectoryCommand(
            cwd,
            navigator.platform.startsWith("Win"),
          );
          await invoke("terminal_write", {
            sessionId,
            data: toBase64(`${changeDirectoryCommand}\r`),
          });
          if (disposed) return;
          readyRef.current = true;
          setReady(true);
          terminal.focus();
        } catch (error) {
          if (!disposed) {
            terminal.write(`\r\n\x1b[31m[终端启动失败] ${String(error)}\x1b[0m\r\n`);
          }
        }
      })();

      return () => {
        disposed = true;
        readyRef.current = false;
        setReady(false);
        resizeObserver.disconnect();
        inputSubscription.dispose();
        unlistenData?.();
        unlistenExit?.();
        invoke("terminal_kill", { sessionId }).catch(() => {});
        terminal.dispose();
        terminalRef.current = null;
        if (sessionIdRef.current === sessionId) sessionIdRef.current = null;
      };
    }, [cwd]);

    return (
      <section className="projecttasks-terminal" aria-label="项目终端">
        <header className="projecttasks-terminal-header">
          <div className="projecttasks-terminal-title">
            <span className="projecttasks-terminal-status" data-ready={ready} />
            <strong>终端</strong>
            <span title={cwd}>{cwd || "未选择项目"}</span>
          </div>
          <button
            type="button"
            className="projecttasks-terminal-clear"
            onClick={() => {
              terminalRef.current?.clear();
              terminalRef.current?.focus();
            }}
          >
            清空
          </button>
        </header>
        <div ref={containerRef} className="projecttasks-terminal-body" />
      </section>
    );
  },
);
