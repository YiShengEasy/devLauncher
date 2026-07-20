export const PROJECT_HISTORY_STORAGE_KEY = "devlauncher.projecttasks.projects";
export const LEGACY_ROOT_STORAGE_KEY = "devlauncher.projecttasks.root";
export const MAX_PROJECT_HISTORY = 24;

export interface ScannedProject {
  root: string;
  name: string;
  taskCount: number;
  scannedFiles: number;
  lastScannedAt: number;
}

function projectNameFromRoot(root: string): string {
  return root.split(/[\\/]/).filter(Boolean).at(-1) ?? "项目";
}

function normalizeProject(value: unknown): ScannedProject | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ScannedProject>;
  const root = typeof candidate.root === "string" ? candidate.root.trim() : "";
  if (!root) return null;
  return {
    root,
    name:
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name.trim()
        : projectNameFromRoot(root),
    taskCount:
      typeof candidate.taskCount === "number" && Number.isFinite(candidate.taskCount)
        ? Math.max(0, Math.floor(candidate.taskCount))
        : 0,
    scannedFiles:
      typeof candidate.scannedFiles === "number" && Number.isFinite(candidate.scannedFiles)
        ? Math.max(0, Math.floor(candidate.scannedFiles))
        : 0,
    lastScannedAt:
      typeof candidate.lastScannedAt === "number" && Number.isFinite(candidate.lastScannedAt)
        ? Math.max(0, Math.floor(candidate.lastScannedAt))
        : 0,
  };
}

export function parseProjectHistory(raw: string | null, legacyRoot?: string | null): ScannedProject[] {
  let values: unknown[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) values = parsed;
    } catch {
      values = [];
    }
  }

  const projects = values.map(normalizeProject).filter((project): project is ScannedProject => Boolean(project));
  const migratedRoot = legacyRoot?.trim();
  if (migratedRoot && !projects.some((project) => project.root === migratedRoot)) {
    projects.unshift({
      root: migratedRoot,
      name: projectNameFromRoot(migratedRoot),
      taskCount: 0,
      scannedFiles: 0,
      lastScannedAt: 0,
    });
  }

  const unique = new Map<string, ScannedProject>();
  for (const project of projects) {
    if (!unique.has(project.root)) unique.set(project.root, project);
  }
  return [...unique.values()].slice(0, MAX_PROJECT_HISTORY);
}

export function upsertProjectHistory(
  projects: ScannedProject[],
  project: ScannedProject,
): ScannedProject[] {
  const normalized = normalizeProject(project);
  if (!normalized) return projects;
  const existingIndex = projects.findIndex((existing) => existing.root === normalized.root);
  if (existingIndex >= 0) {
    return projects.map((existing, index) => index === existingIndex ? normalized : existing);
  }
  return [normalized, ...projects].slice(0, MAX_PROJECT_HISTORY);
}

export function removeProjectHistory(
  projects: ScannedProject[],
  root: string,
): ScannedProject[] {
  return projects.filter((project) => project.root !== root);
}
