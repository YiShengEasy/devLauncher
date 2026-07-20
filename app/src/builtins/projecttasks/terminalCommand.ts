export function terminalChangeDirectoryCommand(cwd: string, windows: boolean): string {
  if (windows) {
    return `Set-Location -LiteralPath '${cwd.replaceAll("'", "''")}'`;
  }
  return `cd -- '${cwd.replaceAll("'", "'\\''")}'`;
}
