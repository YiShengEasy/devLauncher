import { describe, expect, it } from "vitest";
import type { Action, WorkflowDefinition } from "@/types/actions";
import { DEFAULT_THEME, PET_CUSTOM_ACTION_SLOT_COUNT } from "@/types/actions";
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

const workflow: WorkflowDefinition = {
  id: "workflow-test",
  name: "Start project",
  description: "Start and wait",
  enabled: true,
  failurePolicy: "stop",
  schedule: { enabled: true, intervalMinutes: 30 },
  steps: [
    {
      id: "step-test",
      name: "Open docs",
      enabled: true,
      action: urlAction,
      condition: { type: "always" },
      completion: { type: "action_resolved" },
      delayMs: 0,
    },
  ],
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

describe("config normalization", () => {
  it("defaults old theme configs to showing key labels", () => {
    const config = normalizeConfig({
      pages: [],
      theme: {
        bgColor: "#111827",
      },
    });

    expect(config.theme).toEqual({
      ...DEFAULT_THEME,
      bgColor: "#111827",
      showKeyLabels: true,
    });
  });

  it("adds an empty pet menu for old configs", () => {
    const config = normalizeConfig({ pages: [], pet: { codex: { enabled: true } } });

    expect(config.pet?.codex.enabled).toBe(true);
    expect(config.pet?.menu.customActions).toEqual([null, null, null]);
    expect(config.schemaVersion).toBe(1);
    expect(config.revision).toBe(0);
    expect(config.workflows).toEqual([]);
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

  it("round-trips workflows and workflow keyboard bindings", () => {
    const workflowAction: Action = {
      type: "workflow",
      name: workflow.name,
      workflowId: workflow.id,
    };
    const config = normalizeConfig({
      schemaVersion: 2,
      revision: 4,
      workflows: [workflow],
      pages: [{ name: "默认", keys: { D: workflowAction } }],
    });

    expect(config.workflows).toEqual([workflow]);
    expect(config.pages[0]?.keys.D?.action).toEqual(workflowAction);

    const raw = toRawConfig(config);
    expect(raw.schemaVersion).toBe(2);
    expect(raw.revision).toBe(4);
    expect(raw.workflows).toEqual([workflow]);
    expect(raw.pages[0]?.keys.D).toEqual(workflowAction);
  });
});
