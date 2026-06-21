import { describe, expect, it } from "vitest";
import type { InstalledPlugin } from "./types";
import { buildPluginActionRecords } from "./registry";

const plugin: InstalledPlugin = {
  id: "devlauncher.tools.hello",
  version: "1.0.0",
  enabled: true,
  source: "local",
  installedAt: 1782030000000,
  manifest: {
    id: "devlauncher.tools.hello",
    name: "Hello Plugin",
    version: "1.0.0",
    kind: "webview",
    description: "A static test plugin",
    entry: "dist/index.html",
    actions: [{ id: "open", title: "Open Hello", type: "webview" }],
  },
};

describe("plugin registry", () => {
  it("builds launcher records for enabled plugin actions", () => {
    const records = buildPluginActionRecords([plugin]);

    expect(records).toMatchObject([
      {
        id: "plugin:devlauncher.tools.hello:open",
        title: "Open Hello",
        source: "plugin",
        actionKind: "execute-action",
        action: {
          type: "plugin",
          name: "Open Hello",
          pluginId: "devlauncher.tools.hello",
          actionId: "open",
        },
      },
    ]);
  });

  it("does not expose disabled plugins", () => {
    const records = buildPluginActionRecords([{ ...plugin, enabled: false }]);
    expect(records).toEqual([]);
  });
});
