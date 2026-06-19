import { describe, expect, it } from "vitest";
import type { ClipboardEntry } from "@/types/actions";
import {
  clipboardEntryMeta,
  clipboardEntryPreview,
  clipboardEntryTitle,
  filterClipboardEntries,
  isFavoriteEntry,
  resolveSelectedEntryId,
} from "./clipboardPanelModel";

const textEntry = (id: string, content: string): ClipboardEntry => ({
  kind: "text",
  id,
  content,
});

const imageEntry = (id: string, width = 1280, height = 720): ClipboardEntry => ({
  kind: "image",
  id,
  data: "abc123",
  width,
  height,
});

describe("clipboardPanelModel", () => {
  it("filters text entries by content and keeps images visible while searching", () => {
    const entries = [
      textEntry("a", "alpha build log"),
      textEntry("b", "beta deploy note"),
      imageEntry("img"),
    ];

    expect(filterClipboardEntries(entries, "deploy").map((entry) => entry.id)).toEqual(["b", "img"]);
  });

  it("returns all entries when the search text is blank", () => {
    const entries = [textEntry("a", "one"), imageEntry("img")];

    expect(filterClipboardEntries(entries, "   ")).toEqual(entries);
  });

  it("derives text titles from the first non-empty line", () => {
    expect(clipboardEntryTitle(textEntry("a", "\n\n  npm run dev\nsecond line"))).toBe("npm run dev");
  });

  it("falls back to a text title when content is whitespace", () => {
    expect(clipboardEntryTitle(textEntry("a", "   "))).toBe("文本内容");
  });

  it("clamps long previews without removing line breaks from the source excerpt", () => {
    const preview = clipboardEntryPreview(textEntry("a", "line one\nline two\n" + "x".repeat(220)), 42);

    expect(preview.endsWith("...")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(45);
  });

  it("formats image titles and metadata", () => {
    const entry = imageEntry("img", 640, 480);

    expect(clipboardEntryTitle(entry)).toBe("图片 640x480");
    expect(clipboardEntryMeta(entry)).toBe("image");
  });

  it("formats text metadata by character count", () => {
    expect(clipboardEntryMeta(textEntry("a", "abcd"))).toBe("4 chars");
  });

  it("matches favorites by id", () => {
    expect(isFavoriteEntry(textEntry("a", "copy"), [textEntry("a", "copy")])).toBe(true);
    expect(isFavoriteEntry(textEntry("a", "copy"), [textEntry("b", "copy")])).toBe(false);
  });

  it("keeps the current selection when it is still visible", () => {
    const entries = [textEntry("a", "one"), textEntry("b", "two")];

    expect(resolveSelectedEntryId(entries, "b")).toBe("b");
  });

  it("selects the first visible entry when current selection disappeared", () => {
    const entries = [textEntry("a", "one"), textEntry("b", "two")];

    expect(resolveSelectedEntryId(entries, "missing")).toBe("a");
  });

  it("returns null when no entry is visible", () => {
    expect(resolveSelectedEntryId([], "missing")).toBeNull();
  });
});
