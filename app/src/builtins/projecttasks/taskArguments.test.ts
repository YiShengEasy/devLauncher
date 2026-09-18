import { describe, expect, it } from "vitest";
import {
  parseTaskArgumentPresets,
  parseTaskArguments,
  rememberTaskArgumentPreset,
  removeTaskArgumentPreset,
  taskArgumentPresetsFor,
  type TaskArgumentTarget,
} from "./taskArguments";

const target: TaskArgumentTarget = {
  projectId: "project-demo",
  provider: "package",
  sourceKey: "test",
};

describe("project task arguments", () => {
  it("parses quoted values and escaped spaces", () => {
    expect(parseTaskArguments('--check --name "hello world" path\\ with\\ spaces'))
      .toEqual(["--check", "--name", "hello world", "path with spaces"]);
  });

  it("rejects shell control syntax and incomplete quoting", () => {
    expect(() => parseTaskArguments("--check && rm -rf /"))
      .toThrow("Shell 控制符");
    expect(() => parseTaskArguments("--name 'unfinished"))
      .toThrow("引号没有闭合");
  });

  it("stores recent presets independently for each task", () => {
    const another = { ...target, sourceKey: "build" };
    const presets = rememberTaskArgumentPreset(
      rememberTaskArgumentPreset([], target, "--check", 10),
      another,
      "--release",
      20,
    );
    expect(taskArgumentPresetsFor(presets, target).map((item) => item.value))
      .toEqual(["--check"]);
    expect(taskArgumentPresetsFor(presets, another).map((item) => item.value))
      .toEqual(["--release"]);
  });

  it("moves reused presets to the front and removes one preset", () => {
    const initial = rememberTaskArgumentPreset(
      rememberTaskArgumentPreset([], target, "--check", 10),
      target,
      "--watch",
      20,
    );
    const reused = rememberTaskArgumentPreset(initial, target, "--check", 30);
    expect(taskArgumentPresetsFor(reused, target).map((item) => item.value))
      .toEqual(["--check", "--watch"]);
    expect(removeTaskArgumentPreset(reused, target, "--check").map((item) => item.value))
      .toEqual(["--watch"]);
  });

  it("normalizes malformed persisted values", () => {
    expect(parseTaskArgumentPresets([
      { ...target, value: " --check ", lastUsedAt: 2 },
      { ...target, value: "--check", lastUsedAt: 4 },
      { projectId: "", provider: "package", sourceKey: "test", value: "--bad" },
    ])).toEqual([{ ...target, value: "--check", lastUsedAt: 4 }]);
  });
});
