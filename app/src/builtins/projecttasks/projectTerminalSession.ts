export const PROJECT_TERMINAL_SESSIONS_STORAGE_KEY = "devlauncher.projecttasks.terminalSessions";
export const MAX_PROJECT_TERMINAL_SESSIONS = 32;

export interface ProjectTerminalSessionRef {
  cwd: string;
  sessionId: string;
}

function normalizeSession(value: unknown): ProjectTerminalSessionRef | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ProjectTerminalSessionRef>;
  const cwd = typeof candidate.cwd === "string" ? candidate.cwd.trim() : "";
  const sessionId = typeof candidate.sessionId === "string" ? candidate.sessionId.trim() : "";
  return cwd && sessionId ? { cwd, sessionId } : null;
}

export function parseProjectTerminalSessions(raw: string | null): ProjectTerminalSessionRef[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sessions = new Map<string, ProjectTerminalSessionRef>();
    for (const value of parsed) {
      const session = normalizeSession(value);
      if (session && !sessions.has(session.cwd)) sessions.set(session.cwd, session);
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

export function upsertProjectTerminalSession(
  sessions: ProjectTerminalSessionRef[],
  session: ProjectTerminalSessionRef,
): ProjectTerminalSessionRef[] {
  const normalized = normalizeSession(session);
  if (!normalized) return sessions;
  return [normalized, ...sessions.filter((item) => item.cwd !== normalized.cwd)]
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
