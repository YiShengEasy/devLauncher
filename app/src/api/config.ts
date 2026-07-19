import { invoke } from "@tauri-apps/api/core";
import type { KeyboardConfig, Action, PetConfig, ThemeConfig, WorkflowDefinition } from "@/types/actions";
import { DEFAULT_PET_CONFIG, DEFAULT_THEME, PET_CUSTOM_ACTION_SLOT_COUNT } from "@/types/actions";

// 从 Rust 序列化的 Page 结构，keys 是 Record<string, Action>
interface RawPage {
  name: string;
  keys: Record<string, Action>;
}

interface RawPetMenuConfig {
  customActions?: Array<Action | null>;
}

interface RawPetConfig {
  codex?: {
    enabled?: boolean;
  };
  menu?: RawPetMenuConfig;
}

interface RawConfig {
  pages: RawPage[];
  theme?: Partial<ThemeConfig>;
  pet?: RawPetConfig;
  schemaVersion?: number;
  revision?: number;
  workflows?: WorkflowDefinition[];
}

export function normalizePetCustomActions(actions?: Array<Action | null>): Array<Action | null> {
  return Array.from({ length: PET_CUSTOM_ACTION_SLOT_COUNT }, (_, index) => actions?.[index] ?? null);
}

function normalizePetConfig(pet?: RawPetConfig): PetConfig {
  return {
    ...DEFAULT_PET_CONFIG,
    ...pet,
    codex: {
      enabled: false,
      ...pet?.codex,
    },
    menu: {
      customActions: normalizePetCustomActions(pet?.menu?.customActions),
    },
  };
}

// 将 Rust 返回的原始 config 转换为前端 KeyboardConfig 格式
export function normalizeConfig(raw: RawConfig): KeyboardConfig {
  return {
    schemaVersion: raw.schemaVersion ?? 1,
    revision: raw.revision ?? 0,
    pages: raw.pages.map((p) => ({
      name: p.name,
      keys: Object.fromEntries(
        Object.entries(p.keys).map(([k, action]) => [k, { action }])
      ),
    })),
    theme: { ...DEFAULT_THEME, ...raw.theme },
    pet: normalizePetConfig(raw.pet),
    workflows: raw.workflows ?? [],
  };
}

export function toRawConfig(config: KeyboardConfig): RawConfig {
  return {
    schemaVersion: Math.max(2, config.schemaVersion ?? 1),
    revision: config.revision ?? 0,
    pages: config.pages.map((p) => ({
      name: p.name,
      keys: Object.fromEntries(
        Object.entries(p.keys)
          .filter(([, v]) => v.action !== null)
          .map(([k, v]) => [k, v.action as Action])
      ),
    })),
    theme: config.theme,
    workflows: config.workflows ?? [],
    pet: config.pet ? {
      ...config.pet,
      menu: {
        customActions: normalizePetCustomActions(config.pet.menu?.customActions),
      },
    } : normalizePetConfig(undefined),
  };
}

export async function loadConfig(): Promise<KeyboardConfig> {
  const raw = await invoke<RawConfig>("load_config");
  return normalizeConfig(raw);
}

export async function saveConfig(config: KeyboardConfig): Promise<void> {
  await invoke("save_config", { config: toRawConfig(config) });
}

export async function getConfigPath(): Promise<string> {
  return invoke<string>("get_config_path");
}
