import { describe, expect, it } from "vitest";
import { terminalChangeDirectoryCommand } from "./terminalCommand";

describe("project terminal directory command", () => {
  it("quotes POSIX paths with spaces and apostrophes", () => {
    expect(terminalChangeDirectoryCommand("/Users/demo/My Project/it's-ready", false))
      .toBe("cd -- '/Users/demo/My Project/it'\\''s-ready'");
  });

  it("uses PowerShell literal paths on Windows", () => {
    expect(terminalChangeDirectoryCommand("C:\\Work\\Bob's App", true))
      .toBe("Set-Location -LiteralPath 'C:\\Work\\Bob''s App'");
  });
});
