import { invoke } from "@tauri-apps/api/core";
import type { Action, KeyboardConfig } from "@/types/actions";

export type PermissionId = "screenRecording";
export type PermissionFeatureId = "screenshot";

export interface PermissionHealthIssue {
  feature: PermissionFeatureId;
  permission: PermissionId;
  title: string;
  description: string;
}

interface MacPermissionStatus {
  permission: PermissionId;
  supported: boolean;
  granted: boolean;
}

const FEATURE_STATE_KEY = "devlauncher_permission_feature_state";
const SESSION_DISMISS_KEY = "devlauncher_permission_health_dismissed_session";

type FeatureState = Partial<Record<PermissionFeatureId, { usedOrConfigured: boolean }>>;
type SessionDismissState = Partial<Record<PermissionFeatureId, boolean>>;

function readJson<T>(key: string, fallback: T, storage: Storage = window.localStorage): T {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T, storage: Storage = window.localStorage) {
  storage.setItem(key, JSON.stringify(value));
}

function actionUsesFeature(action: Action | null | undefined, feature: PermissionFeatureId): boolean {
  return action?.type === "builtin" && action.feature === feature;
}

export function markPermissionFeatureUsed(feature: PermissionFeatureId) {
  const state = readJson<FeatureState>(FEATURE_STATE_KEY, {});
  writeJson<FeatureState>(FEATURE_STATE_KEY, {
    ...state,
    [feature]: { usedOrConfigured: true },
  });
}

export function recordConfiguredPermissionFeatures(config: KeyboardConfig | null) {
  if (!config) return;
  const hasScreenshot = config.pages.some((page) =>
    Object.values(page.keys).some((binding) => actionUsesFeature(binding.action, "screenshot")),
  );
  if (hasScreenshot) markPermissionFeatureUsed("screenshot");
}

export function dismissPermissionFeatureForSession(feature: PermissionFeatureId) {
  const state = readJson<SessionDismissState>(SESSION_DISMISS_KEY, {}, window.sessionStorage);
  writeJson<SessionDismissState>(SESSION_DISMISS_KEY, { ...state, [feature]: true }, window.sessionStorage);
}

function isDismissedForSession(feature: PermissionFeatureId): boolean {
  return Boolean(readJson<SessionDismissState>(SESSION_DISMISS_KEY, {}, window.sessionStorage)[feature]);
}

async function checkMacPermission(permission: PermissionId): Promise<MacPermissionStatus> {
  return invoke<MacPermissionStatus>("get_macos_permission_status", { permission });
}

export async function getPermissionHealthIssue(): Promise<PermissionHealthIssue | null> {
  const state = readJson<FeatureState>(FEATURE_STATE_KEY, {});
  if (state.screenshot?.usedOrConfigured && !isDismissedForSession("screenshot")) {
    const status = await checkMacPermission("screenRecording");
    if (status.supported && !status.granted) {
      return {
        feature: "screenshot",
        permission: "screenRecording",
        title: "截图权限需要修复",
        description: "截图功能需要屏幕录制权限。可能是系统升级、App 重装或签名变化导致授权失效。",
      };
    }
  }
  return null;
}

export function openPermissionSettings(permission: PermissionId): Promise<void> {
  return invoke("open_macos_permission_settings", { permission });
}
