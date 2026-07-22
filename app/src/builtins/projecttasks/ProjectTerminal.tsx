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
import { planTerminalChunk } from "@/components/workflowTerminal";
import { terminalChangeDirectoryCommand } from "./terminalCommand";
import {
  PROJECT_TERMINAL_SESSIONS_STORAGE_KEY,
  findProjectTerminalSession,
  parseProjectTerminalSessions,
  removeProjectTerminalSession,
  upsertProjectTerminalSession,
} from "./projectTerminalSession";
import "@xterm/xterm/css/xterm.css";

type ShellSpec = [string, string[]];

interface TerminalSnapshot {
  data: string;
  offset: number;
  active: boolean;
}

interface TerminalDataChunk {
  offset: number;
  data: string;
}

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

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function loadStoredSessions() {
  return parseProjectTerminalSessions(
    localStorage.getItem(PROJECT_TERMINAL_SESSIONS_STORAGE_KEY),
  );
}

function rememberSession(cwd: string, sessionId: string) {
  const sessions = upsertProjectTerminalSession(loadStoredSessions(), { cwd, sessionId });
  localStorage.setItem(PROJECT_TERMINAL_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}

function forgetSession(cwd: string, sessionId: string) {
  const sessions = removeProjectTerminalSession(loadStoredSessions(), cwd, sessionId);
  localStorage.setItem(PROJECT_TERMINAL_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
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
    const [starting, setStarting] = useState(false);
    const [generation, setGeneration] = useState(0);

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
      sessionIdRef.current = null;
      readyRef.current = false;
      setReady(false);
      setStarting(true);

      let disposed = false;
      let initialized = false;
      let currentOffset = 0;
      let pending: TerminalDataChunk[] = [];
      let listenerDisposers: Array<() => void> = [];

      const setTerminalReady = (value: boolean) => {
        readyRef.current = value;
        setReady(value);
        setStarting(false);
      };

      const appendChunk = (sessionId: string, chunk: TerminalDataChunk) => {
        if (sessionIdRef.current !== sessionId) return;
        const bytes = decodeBase64(chunk.data);
        const plan = planTerminalChunk(currentOffset, chunk.offset, bytes.length);
        if (plan.gap) {
          pending.push(chunk);
          return;
        }
        if (plan.skipBytes < bytes.length) terminal.write(bytes.slice(plan.skipBytes));
        currentOffset = plan.nextOffset;
      };

      const flushPending = (sessionId: string) => {
        pending.sort((left, right) => left.offset - right.offset);
        const chunks = pending;
        pending = [];
        chunks.forEach((chunk) => appendChunk(sessionId, chunk));
      };

      const clearListeners = () => {
        listenerDisposers.forEach((dispose) => dispose());
        listenerDisposers = [];
      };

      const subscribe = async (sessionId: string): Promise<boolean> => {
        const listeners = await Promise.all([
          listen<TerminalDataChunk>(`terminal-data-v2-${sessionId}`, (event) => {
            if (sessionIdRef.current !== sessionId) return;
            if (!initialized) {
              pending.push(event.payload);
              return;
            }
            appendChunk(sessionId, event.payload);
          }),
          listen(`terminal-exit-${sessionId}`, () => {
            if (sessionIdRef.current !== sessionId) return;
            forgetSession(cwd, sessionId);
            setTerminalReady(false);
            terminal.write("\r\n\x1b[90m[终端进程已退出]\x1b[0m\r\n");
          }),
        ]);
        if (disposed || sessionIdRef.current !== sessionId) {
          listeners.forEach((dispose) => dispose());
          return false;
        }
        listenerDisposers.push(...listeners);
        return true;
      };

      const inputSubscription = terminal.onData((data) => {
        const sessionId = sessionIdRef.current;
        if (!sessionId || !readyRef.current) return;
        invoke("terminal_write", {
          sessionId,
          data: toBase64(data),
        }).catch(() => {});
      });

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        const sessionId = sessionIdRef.current;
        if (!sessionId || !readyRef.current) return;
        invoke("terminal_resize", {
          sessionId,
          cols: terminal.cols,
          rows: terminal.rows,
        }).catch(() => {});
      });
      resizeObserver.observe(container);

      void (async () => {
        try {
          const storedSessionId = findProjectTerminalSession(loadStoredSessions(), cwd);
          if (storedSessionId) {
            sessionIdRef.current = storedSessionId;
            if (await subscribe(storedSessionId)) {
              try {
                const snapshot = await invoke<TerminalSnapshot>("terminal_snapshot", {
                  sessionId: storedSessionId,
                });
                if (disposed || sessionIdRef.current !== storedSessionId) return;
                const bytes = decodeBase64(snapshot.data);
                if (bytes.length > 0) terminal.write(bytes);
                currentOffset = snapshot.offset;
                initialized = true;
                flushPending(storedSessionId);
                if (snapshot.active) {
                  setTerminalReady(true);
                  void invoke("terminal_resize", {
                    sessionId: storedSessionId,
                    cols: terminal.cols,
                    rows: terminal.rows,
                  }).catch(() => {});
                  terminal.focus();
                  return;
                }
              } catch {
                // The backend no longer has this session; create a fresh terminal below.
              }
              clearListeners();
              forgetSession(cwd, storedSessionId);
              terminal.write("\r\n\x1b[90m[原终端会话已结束，正在新建终端]\x1b[0m\r\n");
            }
          }

          if (disposed) return;
          const sessionId = makeSessionId();
          sessionIdRef.current = sessionId;
          initialized = false;
          currentOffset = 0;
          pending = [];
          if (!(await subscribe(sessionId))) return;
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
          rememberSession(cwd, sessionId);
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
          initialized = true;
          flushPending(sessionId);
          setTerminalReady(true);
          terminal.focus();
        } catch (error) {
          if (!disposed) {
            setTerminalReady(false);
            terminal.write(`\r\n\x1b[31m[终端启动失败] ${String(error)}\x1b[0m\r\n`);
          }
        }
      })();

      return () => {
        disposed = true;
        readyRef.current = false;
        setReady(false);
        setStarting(false);
        resizeObserver.disconnect();
        inputSubscription.dispose();
        clearListeners();
        terminal.dispose();
        terminalRef.current = null;
        sessionIdRef.current = null;
      };
    }, [cwd, generation]);

    const stopTerminal = async () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      try {
        await invoke("terminal_kill", { sessionId });
        forgetSession(cwd, sessionId);
        sessionIdRef.current = null;
        readyRef.current = false;
        setReady(false);
        setStarting(false);
        terminalRef.current?.write("\r\n\x1b[90m[终端已手动结束]\x1b[0m\r\n");
      } catch (error) {
        terminalRef.current?.write(`\r\n\x1b[31m[终端结束失败] ${String(error)}\x1b[0m\r\n`);
      }
    };

    return (
      <section className="projecttasks-terminal" aria-label="项目终端">
        <header className="projecttasks-terminal-header">
          <div className="projecttasks-terminal-title">
            <span className="projecttasks-terminal-status" data-ready={ready} />
            <strong>终端</strong>
            <span title={cwd}>{cwd || "未选择项目"}</span>
          </div>
          <div className="projecttasks-terminal-controls">
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
            <button
              type="button"
              className="projecttasks-terminal-clear"
              disabled={starting}
              onClick={() => {
                if (ready) void stopTerminal();
                else setGeneration((value) => value + 1);
              }}
            >
              {starting ? "启动中" : ready ? "结束" : "新建"}
            </button>
          </div>
        </header>
        <div ref={containerRef} className="projecttasks-terminal-body" />
      </section>
    );
  },
);
