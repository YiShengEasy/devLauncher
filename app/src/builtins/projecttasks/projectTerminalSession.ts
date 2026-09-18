export const PROJECT_TERMINAL_SESSIONS_STORAGE_KEY = "devlauncher.projecttasks.terminalSessions";
export const MAX_PROJECT_TERMINAL_SESSIONS = 32;

export interface ProjectTerminalSessionRef {
  cwd: string;
  sessionId: string;
  title?: string;
}

function normalizeSession(value: unknown): ProjectTerminalSessionRef | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ProjectTerminalSessionRef>;
  const cwd = typeof candidate.cwd === "string" ? candidate.cwd.trim() : "";
  const sessionId = typeof candidate.sessionId === "string" ? candidate.sessionId.trim() : "";
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  return cwd && sessionId ? { cwd, sessionId, ...(title ? { title } : {}) } : null;
}

export function parseProjectTerminalSessions(raw: string | null): ProjectTerminalSessionRef[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sessions = new Map<string, ProjectTerminalSessionRef>();
    for (const value of parsed) {
      const session = normalizeSession(value);
      if (session && !sessions.has(session.sessionId)) sessions.set(session.sessionId, session);
    }
    return [...sessions.values()].slice(0, MAX_PROJECT_TERMINAL_SESSIONS);
  } catch {
    return [];
  }
}

export function findProjectTerminalSession(
  sessions: ProjectTerminalSessionRef[],
  cwd: string,
): string | null {
  const normalizedCwd = cwd.trim();
  return sessions.find((session) => session.cwd === normalizedCwd)?.sessionId ?? null;
}

export function findProjectTerminalSessions(
  sessions: ProjectTerminalSessionRef[],
  cwd: string,
): ProjectTerminalSessionRef[] {
  const normalizedCwd = cwd.trim();
  return sessions.filter((session) => session.cwd === normalizedCwd);
}

export function upsertProjectTerminalSession(
  sessions: ProjectTerminalSessionRef[],
  session: ProjectTerminalSessionRef,
): ProjectTerminalSessionRef[] {
  const normalized = normalizeSession(session);
  if (!normalized) return sessions;
  return [normalized, ...sessions.filter((item) => item.sessionId !== normalized.sessionId)]
    .slice(0, MAX_PROJECT_TERMINAL_SESSIONS);
}

export function removeProjectTerminalSession(
  sessions: ProjectTerminalSessionRef[],
  cwd: string,
  sessionId?: string,
): ProjectTerminalSessionRef[] {
  const normalizedCwd = cwd.trim();
  return sessions.filter((session) => (
    session.cwd !== normalizedCwd || (sessionId !== undefined && session.sessionId !== sessionId)
  ));
}

export type ProjectTerminalCopyShortcut = "copy" | "ignore" | "passthrough";

export function projectTerminalCopyShortcut(
  metaKey: boolean,
  ctrlKey: boolean,
  key: string,
  hasSelection: boolean,
): ProjectTerminalCopyShortcut {
  if (key.toLowerCase() !== "c") return "passthrough";
  if (metaKey) return hasSelection ? "copy" : "ignore";
  if (ctrlKey) return "passthrough";
  return "passthrough";
}
