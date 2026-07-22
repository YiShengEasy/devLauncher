import { describe, expect, it } from "vitest";
import { resolveInitialConfigRoot } from "./configStartup";
import type { ScannedProject } from "./history";

const projects: ScannedProject[] = [
  {
    root: "/workspace/first",
    name: "first",
    taskCount: 2,
    scannedFiles: 3,
    lastScannedAt: 1,
  },
  {
    root: "/workspace/second",
    name: "second",
    taskCount: 1,
    scannedFiles: 2,
    lastScannedAt: 1,
  },
];

describe("project config startup", () => {
  it("uses the selected project when entering the config view", () => {
    expect(resolveInitialConfigRoot(" /workspace/selected ", projects)).toBe("/workspace/selected");
  });

  it("falls back to the first project when no selected root is available", () => {
    expect(resolveInitialConfigRoot("", projects)).toBe("/workspace/first");
  });

  it("returns an empty root when there is no project to scan", () => {
    expect(resolveInitialConfigRoot("  ", [])).toBe("");
  });
});
