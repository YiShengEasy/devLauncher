import { describe, expect, it } from "vitest";
import {
  findProjectTerminalSession,
  findProjectTerminalSessions,
  parseProjectTerminalSessions,
  projectTerminalCopyShortcut,
  removeProjectTerminalSession,
  upsertProjectTerminalSession,
  type ProjectTerminalSessionRef,
} from "./projectTerminalSession";

const session: ProjectTerminalSessionRef = {
  cwd: "/workspace/demo",
  sessionId: "projecttasks-demo",
};

describe("project terminal sessions", () => {
  it("parses valid sessions and keeps multiple sessions per project", () => {
    expect(parseProjectTerminalSessions(JSON.stringify([
      session,
      { ...session, sessionId: "second", title: "dev server" },
      { ...session, title: "duplicate id" },
      null,
      {},
    ]))).toEqual([
      session,
      { ...session, sessionId: "second", title: "dev server" },
    ]);
  });

  it("finds all project sessions and replaces only the same identity", () => {
    const replaced = upsertProjectTerminalSession([session], {
      cwd: session.cwd,
      sessionId: "replacement",
    });
    expect(findProjectTerminalSession(replaced, session.cwd)).toBe("replacement");
    expect(findProjectTerminalSessions(replaced, session.cwd)).toHaveLength(2);

    const updated = upsertProjectTerminalSession(replaced, {
      cwd: session.cwd,
      sessionId: "replacement",
      title: "updated",
    });
    expect(updated).toHaveLength(2);
    expect(updated[0].title).toBe("updated");
  });

  it("only removes the matching session identity", () => {
    expect(removeProjectTerminalSession([session], session.cwd, "other")).toEqual([session]);
    expect(removeProjectTerminalSession([session], session.cwd, session.sessionId)).toEqual([]);
  });

  it("ignores malformed persisted data", () => {
    expect(parseProjectTerminalSessions("{bad")).toEqual([]);
    expect(parseProjectTerminalSessions(JSON.stringify([{ cwd: "/a", sessionId: "" }]))).toEqual([]);
  });

  it("keeps Ctrl+C for interruption and limits Cmd+C to copying selections", () => {
    expect(projectTerminalCopyShortcut(true, false, "c", false)).toBe("ignore");
    expect(projectTerminalCopyShortcut(true, false, "C", true)).toBe("copy");
    expect(projectTerminalCopyShortcut(false, true, "c", false)).toBe("passthrough");
    expect(projectTerminalCopyShortcut(false, false, "x", false)).toBe("passthrough");
  });
});
