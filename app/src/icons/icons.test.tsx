import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ACTION_ICON_COMPONENTS,
  BUILTIN_ICON_COMPONENTS,
  CloseIcon,
  FolderIcon,
  IconBase,
  PixelPetIcon,
  SearchIcon,
} from "./index";

describe("IconBase", () => {
  it("uses the 24px icon contract", () => {
    const html = renderToStaticMarkup(
      <IconBase size={20}>
        <path d="M4 4h16v16H4z" />
      </IconBase>,
    );

    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('fill="none"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="1.8"');
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-linejoin="round"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders accessible titles when provided", () => {
    const html = renderToStaticMarkup(<FolderIcon title="Folder" decorative={false} />);

    expect(html).toContain('role="img"');
    expect(html).toContain("<title>Folder</title>");
    expect(html).not.toContain('aria-hidden="true"');
  });
});

describe("icon categories", () => {
  it("exports action icon components for every action type", () => {
    expect(Object.keys(ACTION_ICON_COMPONENTS)).toEqual([
      "app",
      "folder",
      "file",
      "url",
      "ssh",
      "script",
      "system",
      "builtin",
    ]);
  });

  it("exports builtin icon components for every builtin feature", () => {
    expect(Object.keys(BUILTIN_ICON_COMPONENTS)).toEqual([
      "clipboard",
      "json",
      "totp",
      "remotedesk",
      "terminal",
      "screenshot",
      "screenshotai",
      "webaccounts",
      "quickmemory",
    ]);
  });

  it("renders entry and control icons through IconBase", () => {
    const html = renderToStaticMarkup(
      <>
        <SearchIcon size={16} />
        <PixelPetIcon size={28} />
        <CloseIcon size={32} />
      </>,
    );

    expect(html.match(/viewBox="0 0 24 24"/g)).toHaveLength(3);
    expect(html).toContain('width="16"');
    expect(html).toContain('width="28"');
    expect(html).toContain('width="32"');
  });
});
