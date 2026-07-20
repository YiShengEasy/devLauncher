import { describe, expect, it } from "vitest";
import {
  MAX_PROJECT_HISTORY,
  parseProjectHistory,
  removeProjectHistory,
  upsertProjectHistory,
} from "./history";

describe("project task history", () => {
  it("migrates the previous single project root", () => {
    expect(parseProjectHistory(null, "/workspace/example")).toEqual([
      {
        root: "/workspace/example",
        name: "example",
        taskCount: 0,
        scannedFiles: 0,
        lastScannedAt: 0,
      },
    ]);
  });

  it("updates a rescanned project without changing its position", () => {
    const projects = parseProjectHistory(
      JSON.stringify([
        { root: "/a", name: "a", taskCount: 1, scannedFiles: 2, lastScannedAt: 10 },
        { root: "/b", name: "b", taskCount: 2, scannedFiles: 3, lastScannedAt: 20 },
      ]),
    );
    const next = upsertProjectHistory(projects, {
      root: "/b",
      name: "bravo",
      taskCount: 4,
      scannedFiles: 5,
      lastScannedAt: 30,
    });

    expect(next.map((project) => project.root)).toEqual(["/a", "/b"]);
    expect(next[1]).toMatchObject({ name: "bravo", taskCount: 4, scannedFiles: 5 });
  });

  it("adds a newly scanned project to the front", () => {
    const projects = parseProjectHistory(
      JSON.stringify([
        { root: "/a", name: "a", taskCount: 1, scannedFiles: 2, lastScannedAt: 10 },
      ]),
    );
    const next = upsertProjectHistory(projects, {
      root: "/new",
      name: "new",
      taskCount: 3,
      scannedFiles: 4,
      lastScannedAt: 20,
    });

    expect(next.map((project) => project.root)).toEqual(["/new", "/a"]);
  });

  it("removes only the selected history entry and enforces the limit", () => {
    const projects = Array.from({ length: MAX_PROJECT_HISTORY + 3 }, (_, index) => ({
      root: `/project-${index}`,
      name: `project-${index}`,
      taskCount: index,
      scannedFiles: index,
      lastScannedAt: index,
    }));
    const limited = parseProjectHistory(JSON.stringify(projects));
    expect(limited).toHaveLength(MAX_PROJECT_HISTORY);
    expect(removeProjectHistory(limited, limited[0].root)).toHaveLength(MAX_PROJECT_HISTORY - 1);
  });

  it("ignores malformed persisted data", () => {
    expect(parseProjectHistory("{bad")).toEqual([]);
    expect(parseProjectHistory(JSON.stringify([null, {}, { root: "" }]))).toEqual([]);
  });
});
