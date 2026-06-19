import type { ClipboardEntry } from "@/types/actions";

export function filterClipboardEntries(entries: ClipboardEntry[], search: string): ClipboardEntry[] {
  const query = search.trim().toLowerCase();
  if (!query) return entries;
  return entries.filter((entry) => {
    if (entry.kind === "image") return true;
    return entry.content.toLowerCase().includes(query);
  });
}

export function clipboardEntryTitle(entry: ClipboardEntry): string {
  if (entry.kind === "image") return `图片 ${entry.width}x${entry.height}`;
  const firstLine = entry.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? clampText(firstLine, 34) : "文本内容";
}

export function clipboardEntryPreview(entry: ClipboardEntry, maxLength = 140): string {
  if (entry.kind === "image") return `${entry.width}x${entry.height}`;
  return clampText(entry.content.trim() || "空文本", maxLength);
}

export function clipboardEntryMeta(entry: ClipboardEntry): string {
  if (entry.kind === "image") return "image";
  return `${entry.content.length} chars`;
}

export function isFavoriteEntry(entry: ClipboardEntry, favorites: ClipboardEntry[]): boolean {
  return favorites.some((favorite) => favorite.id === entry.id);
}

export function resolveSelectedEntryId(entries: ClipboardEntry[], selectedId: string | null): string | null {
  if (selectedId && entries.some((entry) => entry.id === selectedId)) return selectedId;
  return entries[0]?.id ?? null;
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength)).trimEnd()}...`;
}
