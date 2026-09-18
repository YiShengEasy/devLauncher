import { invoke } from "@tauri-apps/api/core";
import {
  PROJECT_CONFIG_FAVORITES_STORAGE_KEY,
  parseConfigFavorites,
  type FavoriteConfigRef,
} from "./configFavorites";
import {
  PROJECT_TASK_FAVORITES_STORAGE_KEY,
  parseTaskFavorites,
  type FavoriteTaskRef,
} from "./favorites";
import {
  LEGACY_ROOT_STORAGE_KEY,
  PROJECT_HISTORY_STORAGE_KEY,
  parseProjectHistory,
  type ScannedProject,
} from "./history";
import { parseTaskArgumentPresets, type TaskArgumentPreset } from "./taskArguments";

export interface ProjectTasksData {
  schemaVersion: number;
  projectProfiles: ProjectProfile[];
  projects: ScannedProject[];
  taskFavorites: FavoriteTaskRef[];
  configFavorites: FavoriteConfigRef[];
  taskArgumentPresets: TaskArgumentPreset[];
  lastRoot: string;
}

export interface ProjectProfile {
  id: string;
  name: string;
  root: string;
  createdAt: number;
  lastVisitedAt: number;
  status: "ready" | "missing" | string;
  repositoryHint?: string;
}

const EMPTY_DATA: ProjectTasksData = {
  schemaVersion: 3,
  projectProfiles: [],
  projects: [],
  taskFavorites: [],
  configFavorites: [],
  taskArgumentPresets: [],
  lastRoot: "",
};

function localStorageData(): ProjectTasksData {
  return {
    schemaVersion: 3,
    projectProfiles: [],
    projects: parseProjectHistory(
      localStorage.getItem(PROJECT_HISTORY_STORAGE_KEY),
      localStorage.getItem(LEGACY_ROOT_STORAGE_KEY),
    ),
    taskFavorites: parseTaskFavorites(localStorage.getItem(PROJECT_TASK_FAVORITES_STORAGE_KEY)),
    configFavorites: parseConfigFavorites(localStorage.getItem(PROJECT_CONFIG_FAVORITES_STORAGE_KEY)),
    taskArgumentPresets: [],
    lastRoot: localStorage.getItem(LEGACY_ROOT_STORAGE_KEY)?.trim() ?? "",
  };
}

function normalizeData(data: Partial<ProjectTasksData> | null | undefined): ProjectTasksData {
  const profiles = Array.isArray(data?.projectProfiles)
    ? data.projectProfiles.filter((profile): profile is ProjectProfile =>
        Boolean(profile && typeof profile.id === "string" && typeof profile.root === "string")
      )
    : [];
  return {
    schemaVersion: typeof data?.schemaVersion === "number" ? Math.max(3, data.schemaVersion) : 3,
    projectProfiles: profiles,
    projects: parseProjectHistory(JSON.stringify(data?.projects ?? [])),
    taskFavorites: parseTaskFavorites(JSON.stringify(data?.taskFavorites ?? [])),
    configFavorites: parseConfigFavorites(JSON.stringify(data?.configFavorites ?? [])),
    taskArgumentPresets: parseTaskArgumentPresets(data?.taskArgumentPresets),
    lastRoot: typeof data?.lastRoot === "string" ? data.lastRoot.trim() : "",
  };
}

export async function loadProjectTasksData(): Promise<ProjectTasksData> {
  const stored = normalizeData(await invoke<ProjectTasksData>("load_projecttasks_data"));
  const legacy = localStorageData();
  const migrated: ProjectTasksData = {
    schemaVersion: stored.schemaVersion,
    projectProfiles: stored.projectProfiles,
    projects: stored.projects.length ? stored.projects : legacy.projects,
    taskFavorites: stored.taskFavorites.length ? stored.taskFavorites : legacy.taskFavorites,
    configFavorites: stored.configFavorites.length ? stored.configFavorites : legacy.configFavorites,
    taskArgumentPresets: stored.taskArgumentPresets,
    lastRoot: stored.lastRoot || legacy.lastRoot,
  };
  if (JSON.stringify(migrated) !== JSON.stringify(stored)) {
    await saveProjectTasksData(migrated);
  }
  return migrated;
}

export async function saveProjectTasksData(data: ProjectTasksData): Promise<void> {
  await invoke("save_projecttasks_data", { data: normalizeData(data) });
}

export async function updateProjectTasksData(
  patch: Partial<ProjectTasksData>,
): Promise<ProjectTasksData> {
  const current = normalizeData(
    await invoke<ProjectTasksData>("load_projecttasks_data").catch(() => EMPTY_DATA),
  );
  const next = normalizeData({ ...current, ...patch });
  await saveProjectTasksData(next);
  return next;
}
