import { describe, expect, it } from "vitest";
import { planTerminalChunk } from "./workflowTerminal";

describe("planTerminalChunk", () => {
  it("appends a new chunk", () => {
    expect(planTerminalChunk(0, 0, 12)).toEqual({
      gap: false,
      skipBytes: 0,
      nextOffset: 12,
    });
  });

  it("discards duplicate and overlapping bytes", () => {
    expect(planTerminalChunk(12, 0, 12).skipBytes).toBe(12);
    expect(planTerminalChunk(12, 8, 10)).toEqual({
      gap: false,
      skipBytes: 4,
      nextOffset: 18,
    });
  });

  it("requests a snapshot when an event has a gap", () => {
    expect(planTerminalChunk(12, 20, 4)).toEqual({
      gap: true,
      skipBytes: 0,
      nextOffset: 12,
    });
  });
});
