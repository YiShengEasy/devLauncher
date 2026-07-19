import { describe, expect, it } from "vitest";
import type { Action } from "@/types/actions";
import { actionIconAccent, actionIconMonogram } from "./actionIconIdentity";

describe("action icon identity", () => {
  it("creates useful fallback monograms for websites, SSH and plugins", () => {
    const website: Action = { type: "url", name: "代码仓库", target: "https://github.com/example" };
    const ssh: Action = { type: "ssh", name: "生产数据库", host: "db.example.com", user: "root" };
    const plugin: Action = {
      type: "plugin",
      name: "Hello Tools",
      pluginId: "devlauncher.hello",
      actionId: "open",
    };

    expect(actionIconMonogram(website)).toBe("GI");
    expect(actionIconMonogram(ssh)).toBe("生产");
    expect(actionIconMonogram(plugin)).toBe("HT");
  });

  it("keeps colors stable while distinguishing different targets of the same type", () => {
    const first: Action = { type: "ssh", name: "Server", host: "one.example.com", user: "root" };
    const second: Action = { type: "ssh", name: "Server", host: "two.example.com", user: "root" };

    expect(actionIconAccent(first)).toBe(actionIconAccent(first));
    expect(actionIconAccent(first)).not.toBe(actionIconAccent(second));
  });
});
