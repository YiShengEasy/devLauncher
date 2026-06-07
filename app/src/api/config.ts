import { invoke } from "@tauri-apps/api/core";
import type { KeyboardConfig, Action, ThemeConfig } from "@/types/actions";
import { DEFAULT_THEME } from "@/types/actions";

// 从 Rust 序列化的 Page 结构，keys 是 Record<string, Action>
interface RawPage {
  name: string;
  keys: Record<string, Action>;
}
interface RawConfig {
  pages: RawPage[];
  theme?: ThemeConfig;
}

// 将 Rust 返回的原始 config 转换为前端 KeyboardConfig 格式
function normalizeConfig(raw: RawConfig): KeyboardConfig {
  return {
    pages: raw.pages.map((p) => ({
      name: p.name,
      keys: Object.fromEntries(
        Object.entries(p.keys).map(([k, action]) => [k, { action }])
      ),
    })),
    theme: raw.theme ?? { ...DEFAULT_THEME },
  };
}

export async function loadConfig(): Promise<KeyboardConfig> {
  const raw = await invoke<RawConfig>("load_config");
  return normalizeConfig(raw);
}

export async function saveConfig(config: KeyboardConfig): Promise<void> {
  // 将前端格式转回 Rust 期望的格式
  const raw: RawConfig = {
    pages: config.pages.map((p) => ({
      name: p.name,
      keys: Object.fromEntries(
        Object.entries(p.keys)
          .filter(([, v]) => v.action !== null)
          .map(([k, v]) => [k, v.action as Action])
      ),
    })),
    theme: config.theme,
  };
  await invoke("save_config", { config: raw });
}

export async function getConfigPath(): Promise<string> {
  return invoke<string>("get_config_path");
}
