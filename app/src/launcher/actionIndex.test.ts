import { describe, expect, it } from "vitest";
import type { BuiltinManifest } from "@/builtins/types";
import type { KeyboardConfig } from "@/types/actions";
import {
  buildBuiltinActionRecords,
  buildKeyboardActionRecords,
  buildOcrActionRecords,
  searchActionRecords,
} from "./actionIndex";

const config: KeyboardConfig = {
  pages: [
    {
      name: "Dev",
      keys: {
        Q: { action: { type: "app", name: "VS Code", target: "C:/Code/Code.exe" } },
        W: { action: { type: "url", name: "GitHub", target: "https://github.com" } },
      },
    },
    {
      name: "Ops",
      keys: {
        A: { action: { type: "builtin", name: "Clipboard", feature: "clipboard" } },
      },
    },
  ],
};

const manifests: BuiltinManifest[] = [
  {
    id: "terminal",
    name: "Terminal",
    description: "Built-in terminal",
    emoji: ">",
    window: { width: 860, height: 520 },
  },
];

describe("actionIndex", () => {
  it("builds searchable records from keyboard bindings", () => {
    const records = buildKeyboardActionRecords(config);

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      id: "keyboard:0:Q",
      title: "VS Code",
      subtitle: "Dev / Q",
      source: "keyboard",
      actionKind: "execute-action",
      pageName: "Dev",
      keyId: "Q",
    });
  });

  it("builds builtin records from manifests", () => {
    const records = buildBuiltinActionRecords(manifests);

    expect(records).toEqual([
      expect.objectContaining({
        id: "builtin:terminal",
        title: "Terminal",
        source: "builtin",
        actionKind: "toggle-builtin",
      }),
    ]);
  });

  it("ranks exact and prefix matches before fuzzy matches", () => {
    const records = [
      ...buildKeyboardActionRecords(config),
      ...buildBuiltinActionRecords(manifests),
    ];

    const results = searchActionRecords(records, "git");

    expect(results[0].record.title).toBe("GitHub");
    expect(results[0].score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("returns recent/builtin defaults for an empty query", () => {
    const records = searchActionRecords([
      { ...buildKeyboardActionRecords(config)[0], lastUsedAt: 10 },
      ...buildBuiltinActionRecords(manifests),
    ], "");

    expect(records.map((item) => item.record.id)).toEqual([
      "keyboard:0:Q",
      "builtin:terminal",
    ]);
  });

  it("builds OCR result actions for non-empty text", () => {
    const records = buildOcrActionRecords("npm run build failed");

    expect(records.map((record) => record.id)).toEqual([
      "ocr:copy",
      "ocr:search",
      "ocr:report",
    ]);
    expect(records[0].title).toBe("Copy OCR text");
  });
});
