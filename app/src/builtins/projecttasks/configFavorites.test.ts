import { describe, expect, it } from "vitest";
import {
  isConfigFavorite,
  parseConfigFavorites,
  sortConfigsByFavorite,
  toggleConfigFavorite,
  type FavoriteConfigRef,
} from "./configFavorites";

const config: FavoriteConfigRef = {
  root: "/workspace/demo",
  path: "config/application.test.yaml",
};

describe("project config favorites", () => {
  it("parses valid entries and removes duplicates", () => {
    expect(parseConfigFavorites(JSON.stringify([config, config, null, {}]))).toEqual([config]);
  });

  it("toggles a favorite with a stable project and path identity", () => {
    const added = toggleConfigFavorite([], config);
    expect(isConfigFavorite(added, config)).toBe(true);
    expect(toggleConfigFavorite(added, config)).toEqual([]);
  });

  it("sorts favorites first without changing order within each group", () => {
    const files = [{ path: "a.env" }, { path: "b.env" }, { path: "c.env" }];
    expect(sortConfigsByFavorite(files, config.root, [{ root: config.root, path: "b.env" }])).toEqual([
      { path: "b.env" },
      { path: "a.env" },
      { path: "c.env" },
    ]);
  });

  it("keeps favorites isolated between projects and ignores malformed data", () => {
    expect(isConfigFavorite([config], { ...config, root: "/workspace/other" })).toBe(false);
    expect(parseConfigFavorites("{bad")).toEqual([]);
    expect(parseConfigFavorites(JSON.stringify([{ root: "/a", path: "" }]))).toEqual([]);
  });
});
