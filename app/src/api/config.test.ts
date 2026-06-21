import { describe, expect, it } from "vitest";
import type { Action } from "@/types/actions";
import { PET_CUSTOM_ACTION_SLOT_COUNT } from "@/types/actions";
import { normalizeConfig, toRawConfig } from "./config";

const clipboardAction: Action = {
  type: "builtin",
  name: "剪切板",
  feature: "clipboard",
};

const jsonAction: Action = {
  type: "builtin",
  name: "JSON",
  feature: "json",
};

const urlAction: Action = {
  type: "url",
  name: "Open Docs",
  target: "https://example.com",
};

const scriptAction: Action = {
  type: "script",
  name: "Echo",
  shell: "terminal",
  content: "echo hello",
};

const pluginAction: Action = {
  type: "plugin",
  name: "Open Hello WebView",
  pluginId: "devlauncher.examples.hello",
  actionId: "open",
};

describe("config normalization", () => {
  it("adds an empty pet menu for old configs", () => {
    const config = normalizeConfig({ pages: [], pet: { codex: { enabled: true } } });

    expect(config.pet?.codex.enabled).toBe(true);
    expect(config.pet?.menu.customActions).toEqual([null, null, null]);
  });

  it("pads short pet custom action arrays to three slots", () => {
    const config = normalizeConfig({
      pages: [],
      pet: {
        codex: { enabled: false },
        menu: { customActions: [clipboardAction] },
      },
    });

    expect(config.pet?.menu.customActions).toEqual([clipboardAction, null, null]);
  });

  it("caps pet custom action arrays to three slots when saving", () => {
    const raw = toRawConfig({
      pages: [],
      theme: undefined,
      pet: {
        codex: { enabled: false },
        menu: { customActions: [clipboardAction, jsonAction, urlAction, scriptAction] },
      },
    });

    expect(raw.pet?.menu?.customActions).toHaveLength(PET_CUSTOM_ACTION_SLOT_COUNT);
    expect(raw.pet?.menu?.customActions).toEqual([clipboardAction, jsonAction, urlAction]);
  });

  it("preserves plugin actions when loading and saving config", () => {
    const config = normalizeConfig({
      pages: [
        {
          name: "默认",
          keys: {
            Q: pluginAction,
          },
        },
      ],
      pet: {
        menu: {
          customActions: [pluginAction],
        },
      },
    });

    const page = config.pages[0]!;
    const binding = page.keys.Q!;
    expect(binding.action).toEqual(pluginAction);
    expect(config.pet?.menu.customActions[0]).toEqual(pluginAction);

    const raw = toRawConfig(config);
    const rawPage = raw.pages[0]!;
    const rawAction = rawPage.keys.Q!;
    expect(rawAction).toEqual(pluginAction);
    expect(raw.pet?.menu?.customActions?.[0]).toEqual(pluginAction);
  });
});
