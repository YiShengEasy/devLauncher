import type { ScannedProject } from "./history";

export function resolveInitialConfigRoot(
  initialRoot: string,
  projects: ScannedProject[],
): string {
  const preferred = initialRoot.trim();
  if (preferred) return preferred;
  return projects[0]?.root.trim() ?? "";
}
