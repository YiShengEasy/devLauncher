import { describe, expect, it } from "vitest";
import {
  findProjectTerminalSession,
  parseProjectTerminalSessions,
  removeProjectTerminalSession,
  upsertProjectTerminalSession,
  type ProjectTerminalSessionRef,
} from "./projectTerminalSession";

const session: ProjectTerminalSessionRef = {
  cwd: "/workspace/demo",
  sessionId: "projecttasks-demo",
};

describe("project terminal sessions", () => {
  it("parses valid sessions and keeps one session per project", () => {
    expect(parseProjectTerminalSessions(JSON.stringify([
      session,
      { ...session, sessionId: "duplicate" },
      null,
      {},
    ]))).toEqual([session]);
  });

  it("finds and replaces the current project session", () => {
    const replaced = upsertProjectTerminalSession([session], {
      cwd: session.cwd,
      sessionId: "replacement",
    });
    expect(findProjectTerminalSession(replaced, session.cwd)).toBe("replacement");
  });

  it("only removes the matching session identity", () => {
    expect(removeProjectTerminalSession([session], session.cwd, "other")).toEqual([session]);
    expect(removeProjectTerminalSession([session], session.cwd, session.sessionId)).toEqual([]);
  });

  it("ignores malformed persisted data", () => {
    expect(parseProjectTerminalSessions("{bad")).toEqual([]);
    expect(parseProjectTerminalSessions(JSON.stringify([{ cwd: "/a", sessionId: "" }]))).toEqual([]);
  });
});
