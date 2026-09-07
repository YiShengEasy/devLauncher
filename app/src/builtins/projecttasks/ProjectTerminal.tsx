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
import { AddIcon, CloseIcon } from "@/icons";
import { planTerminalChunk } from "@/components/workflowTerminal";
import {
  PROJECT_TERMINAL_SESSIONS_STORAGE_KEY,
  findProjectTerminalSessions,
  parseProjectTerminalSessions,
  projectTerminalCopyShortcut,
  removeProjectTerminalSession,
  upsertProjectTerminalSession,
  type ProjectTerminalSessionRef,
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

interface ProjectTerminalTab extends ProjectTerminalSessionRef {
  title: string;
}

interface PendingTaskRun {
  command: string;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export interface ProjectTerminalHandle {
  run: (command: string, title?: string) => Promise<void>;
  focus: () => void;
}

interface ProjectTerminalProps {
  cwd: string;
}

function makeSessionId(): string {
  return `projecttasks-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function makeTab(cwd: string, title: string): ProjectTerminalTab {
  return { cwd, sessionId: makeSessionId(), title };
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

function rememberSession(tab: ProjectTerminalTab) {
  const sessions = upsertProjectTerminalSession(loadStoredSessions(), tab);
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
    const cwdRef = useRef(cwd);
    const tabsRef = useRef<ProjectTerminalTab[]>([]);
    const pendingRunsRef = useRef(new Map<string, PendingTaskRun>());
    const [tabs, setTabs] = useState<ProjectTerminalTab[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [starting, setStarting] = useState(false);
    const [clearing, setClearing] = useState(false);

    cwdRef.current = cwd;
    tabsRef.current = tabs;

    const rejectPendingRun = (sessionId: string, error: unknown) => {
      const pending = pendingRunsRef.current.get(sessionId);
      if (!pending) return;
      pendingRunsRef.current.delete(sessionId);
      pending.reject(error);
    };

    useImperativeHandle(ref, () => ({
      run(command: string, title?: string) {
        const projectRoot = cwdRef.current.trim();
        if (!projectRoot) return Promise.reject(new Error("请先选择项目目录"));
        const tab = makeTab(projectRoot, title?.trim() || `终端 ${tabsRef.current.length + 1}`);
        return new Promise<void>((resolve, reject) => {
          pendingRunsRef.current.set(tab.sessionId, { command, resolve, reject });
          setTabs((current) => [...current, tab]);
          setActiveSessionId(tab.sessionId);
        });
      },
      focus() {
        terminalRef.current?.focus();
      },
    }), []);

    useEffect(() => {
      for (const [sessionId, pending] of pendingRunsRef.current) {
        pending.reject(new Error("项目已切换，任务未执行"));
        pendingRunsRef.current.delete(sessionId);
      }
      const projectRoot = cwd.trim();
      if (!projectRoot) {
        setTabs([]);
        setActiveSessionId(null);
        return;
      }
      const stored = findProjectTerminalSessions(loadStoredSessions(), projectRoot)
        .map<ProjectTerminalTab>((session, index) => ({
          ...session,
          title: session.title || `终端 ${index + 1}`,
        }));
      const nextTabs = stored.length ? stored : [makeTab(projectRoot, "终端 1")];
      setTabs(nextTabs);
      setActiveSessionId(nextTabs[0].sessionId);
    }, [cwd]);

    useEffect(() => {
      const container = containerRef.current;
      const tab = tabsRef.current.find((item) => item.sessionId === activeSessionId);
      if (!container || !tab || tab.cwd !== cwd.trim()) return;

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
      container.innerHTML = "";
      terminal.open(container);
      fitAddon.fit();

      terminalRef.current = terminal;
      sessionIdRef.current = tab.sessionId;
      readyRef.current = false;
      setReady(false);
      setStarting(true);

      let disposed = false;
      let initialized = false;
      let currentOffset = 0;
      let pendingChunks: TerminalDataChunk[] = [];
      let listenerDisposers: Array<() => void> = [];

      const setTerminalReady = (value: boolean) => {
        if (disposed) return;
        readyRef.current = value;
        setReady(value);
        setStarting(false);
      };

      const appendChunk = (chunk: TerminalDataChunk) => {
        if (sessionIdRef.current !== tab.sessionId) return;
        const bytes = decodeBase64(chunk.data);
        const plan = planTerminalChunk(currentOffset, chunk.offset, bytes.length);
        if (plan.gap) {
          pendingChunks.push(chunk);
          return;
        }
        if (plan.skipBytes < bytes.length) terminal.write(bytes.slice(plan.skipBytes));
        currentOffset = plan.nextOffset;
      };

      const flushPending = () => {
        pendingChunks.sort((left, right) => left.offset - right.offset);
        const chunks = pendingChunks;
        pendingChunks = [];
        chunks.forEach(appendChunk);
      };

      const clearListeners = () => {
        listenerDisposers.forEach((dispose) => dispose());
        listenerDisposers = [];
      };

      const failPendingRun = (error: unknown) => {
        rejectPendingRun(tab.sessionId, error);
      };

      const sendPendingCommand = async () => {
        const pending = pendingRunsRef.current.get(tab.sessionId);
        if (!pending) return;
        try {
          await invoke("terminal_write", {
            sessionId: tab.sessionId,
            data: toBase64(`${pending.command.trimEnd()}\r`),
          });
          pendingRunsRef.current.delete(tab.sessionId);
          pending.resolve();
        } catch (error) {
          failPendingRun(error);
          throw error;
        }
      };

      const subscribe = async (): Promise<boolean> => {
        const listeners = await Promise.all([
          listen<TerminalDataChunk>(`terminal-data-v2-${tab.sessionId}`, (event) => {
            if (!initialized) {
              pendingChunks.push(event.payload);
              return;
            }
            appendChunk(event.payload);
          }),
          listen(`terminal-clear-${tab.sessionId}`, () => {
            if (sessionIdRef.current !== tab.sessionId) return;
            pendingChunks = [];
            currentOffset = 0;
            initialized = true;
            terminal.reset();
            terminal.focus();
            setClearing(false);
          }),
          listen(`terminal-exit-${tab.sessionId}`, () => {
            forgetSession(tab.cwd, tab.sessionId);
            setTerminalReady(false);
            failPendingRun(new Error("终端进程在任务执行前退出"));
            terminal.write("\r\n\x1b[90m[终端进程已退出]\x1b[0m\r\n");
          }),
        ]);
        if (disposed || sessionIdRef.current !== tab.sessionId) {
          listeners.forEach((dispose) => dispose());
          return false;
        }
        listenerDisposers.push(...listeners);
        return true;
      };

      const inputSubscription = terminal.onData((data) => {
        if (!readyRef.current || sessionIdRef.current !== tab.sessionId) return;
        invoke("terminal_write", {
          sessionId: tab.sessionId,
          data: toBase64(data),
        }).catch(() => {});
      });

      terminal.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;
        const action = projectTerminalCopyShortcut(
          event.metaKey,
          event.ctrlKey,
          event.key,
          terminal.hasSelection(),
        );
        if (action === "copy") {
          event.preventDefault();
          void navigator.clipboard.writeText(terminal.getSelection());
          return false;
        }
        if (action === "ignore") {
          event.preventDefault();
          return false;
        }
        return true;
      });

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        if (!readyRef.current || sessionIdRef.current !== tab.sessionId) return;
        invoke("terminal_resize", {
          sessionId: tab.sessionId,
          cols: terminal.cols,
          rows: terminal.rows,
        }).catch(() => {});
      });
      resizeObserver.observe(container);

      void (async () => {
        try {
          if (!(await subscribe())) return;
          const snapshot = await invoke<TerminalSnapshot>("terminal_snapshot", {
            sessionId: tab.sessionId,
          }).catch(() => null);
          if (snapshot) {
            if (disposed || sessionIdRef.current !== tab.sessionId) return;
            const bytes = decodeBase64(snapshot.data);
            if (bytes.length > 0) terminal.write(bytes);
            currentOffset = snapshot.offset;
            initialized = true;
            flushPending();
            if (snapshot.active) {
              setTerminalReady(true);
              await invoke("terminal_resize", {
                sessionId: tab.sessionId,
                cols: terminal.cols,
                rows: terminal.rows,
              }).catch(() => {});
              await sendPendingCommand();
              terminal.focus();
              return;
            }
            setTerminalReady(false);
            failPendingRun(new Error("终端会话已结束，请新建标签后重试"));
            return;
          }

          // No backend snapshot means this is a new or stale persisted tab.
          const [cmd, args] = await invoke<ShellSpec>("get_default_shell").catch(shellFallback);
          if (disposed) return;
          await invoke("terminal_spawn", {
            sessionId: tab.sessionId,
            cmd,
            args,
            cols: terminal.cols,
            rows: terminal.rows,
            cwd: tab.cwd,
          });
          if (disposed) {
            await invoke("terminal_kill", { sessionId: tab.sessionId }).catch(() => {});
            return;
          }
          rememberSession(tab);
          initialized = true;
          flushPending();
          setTerminalReady(true);
          await sendPendingCommand();
          terminal.focus();
        } catch (error) {
          failPendingRun(error);
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
        setClearing(false);
        resizeObserver.disconnect();
        inputSubscription.dispose();
        clearListeners();
        terminal.dispose();
        terminalRef.current = null;
        sessionIdRef.current = null;
      };
    }, [activeSessionId, cwd]);

    const addTerminalTab = () => {
      const projectRoot = cwd.trim();
      if (!projectRoot) return;
      const tab = makeTab(projectRoot, `终端 ${tabs.length + 1}`);
      setTabs((current) => [...current, tab]);
      setActiveSessionId(tab.sessionId);
    };

    const closeTerminalTab = async (sessionId: string) => {
      const target = tabsRef.current.find((tab) => tab.sessionId === sessionId);
      if (!target) return;
      rejectPendingRun(sessionId, new Error("终端标签已关闭，任务未执行"));
      await invoke("terminal_kill", { sessionId }).catch(() => {});
      forgetSession(target.cwd, sessionId);

      let remaining = tabsRef.current.filter((tab) => tab.sessionId !== sessionId);
      if (!remaining.length && cwdRef.current.trim()) {
        remaining = [makeTab(cwdRef.current.trim(), "终端 1")];
      }
      setTabs(remaining);
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining.at(-1)?.sessionId ?? null);
      }
    };

    const activeTab = tabs.find((tab) => tab.sessionId === activeSessionId);

    const clearActiveTerminal = async () => {
      if (!activeSessionId || clearing) return;
      setClearing(true);
      try {
        await invoke("terminal_clear", { sessionId: activeSessionId });
        setClearing(false);
      } catch (error) {
        setClearing(false);
        terminalRef.current?.write(
          `\r\n\x1b[31m[清空终端失败] ${String(error)}\x1b[0m\r\n`,
        );
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
              onClick={() => void clearActiveTerminal()}
              disabled={!activeSessionId || starting || clearing}
            >
              {clearing ? "清空中" : "清空"}
            </button>
            <button
              type="button"
              className="projecttasks-terminal-icon-button"
              onClick={addTerminalTab}
              disabled={!cwd.trim() || starting}
              title="新建终端标签"
              aria-label="新建终端标签"
            >
              <AddIcon size={13} decorative />
            </button>
          </div>
        </header>
        <div className="projecttasks-terminal-tabs" role="tablist" aria-label="终端标签">
          {tabs.map((tab) => (
            <div
              key={tab.sessionId}
              className="projecttasks-terminal-tab"
              data-active={tab.sessionId === activeSessionId}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab.sessionId === activeSessionId}
                className="projecttasks-terminal-tab-main"
                onClick={() => setActiveSessionId(tab.sessionId)}
                title={tab.title}
              >
                {tab.title}
              </button>
              <button
                type="button"
                className="projecttasks-terminal-tab-close"
                onClick={() => void closeTerminalTab(tab.sessionId)}
                title={`关闭 ${tab.title}`}
                aria-label={`关闭 ${tab.title}`}
              >
                <CloseIcon size={10} decorative />
              </button>
            </div>
          ))}
          {!tabs.length && <span className="projecttasks-terminal-tabs-empty">未选择项目</span>}
        </div>
        <div
          ref={containerRef}
          className="projecttasks-terminal-body"
          aria-label={activeTab ? `${activeTab.title} 输出` : "终端输出"}
        />
      </section>
    );
  },
);
