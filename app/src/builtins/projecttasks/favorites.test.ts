import { describe, expect, it } from "vitest";
import {
  isTaskFavorite,
  parseTaskFavorites,
  toggleTaskFavorite,
  type FavoriteTaskRef,
} from "./favorites";

const task: FavoriteTaskRef = {
  root: "/workspace/demo",
  file: "TASKS.md",
  name: "dev-start",
};

describe("project task favorites", () => {
  it("parses valid entries and removes duplicates", () => {
    expect(parseTaskFavorites(JSON.stringify([task, task, null, {}]))).toEqual([task]);
  });

  it("toggles a favorite with a stable project, file, and name identity", () => {
    const added = toggleTaskFavorite([], task);
    expect(isTaskFavorite(added, task)).toBe(true);
    expect(toggleTaskFavorite(added, task)).toEqual([]);
  });

  it("ignores malformed persisted data", () => {
    expect(parseTaskFavorites("{bad")).toEqual([]);
    expect(parseTaskFavorites(JSON.stringify([{ root: "/a", file: "", name: "x" }]))).toEqual([]);
  });
});
