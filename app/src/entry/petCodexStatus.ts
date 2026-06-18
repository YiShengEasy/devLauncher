export type PetCodexStatus =
  | "idle"
  | "working"
  | "waiting"
  | "success"
  | "error"
  | "disconnected";

export type PetCodexStatusPayload = {
  status: PetCodexStatus;
  message?: string;
};

export const PET_CODEX_STATUS_EVENT = "pet-codex-status";
export const PET_CODEX_ENABLED_STORAGE_KEY = "devlauncher:pet-codex-enabled";

export const DEFAULT_PET_CODEX_STATUS: PetCodexStatusPayload = {
  status: "idle",
};

const PET_CODEX_STATUS_LABELS: Record<PetCodexStatus, string> = {
  idle: "空闲",
  working: "执行中",
  waiting: "等待确认",
  success: "已完成",
  error: "失败",
  disconnected: "未连接",
};

const PET_CODEX_STATUS_COLORS: Record<PetCodexStatus, string> = {
  idle: "#94a3b8",
  working: "#38bdf8",
  waiting: "#facc15",
  success: "#4ade80",
  error: "#fb7185",
  disconnected: "#a78bfa",
};

export function isPetCodexStatus(value: unknown): value is PetCodexStatus {
  return (
    value === "idle" ||
    value === "working" ||
    value === "waiting" ||
    value === "success" ||
    value === "error" ||
    value === "disconnected"
  );
}

export function normalizePetCodexStatusPayload(value: unknown): PetCodexStatusPayload {
  if (typeof value === "string" && isPetCodexStatus(value)) {
    return { status: value };
  }

  if (!value || typeof value !== "object") return DEFAULT_PET_CODEX_STATUS;
  const candidate = value as { status?: unknown; message?: unknown };
  const status = isPetCodexStatus(candidate.status) ? candidate.status : DEFAULT_PET_CODEX_STATUS.status;
  const message = typeof candidate.message === "string" ? candidate.message.trim().slice(0, 60) : "";
  return message ? { status, message } : { status };
}

export function getPetCodexStatusLabel(status: PetCodexStatus): string {
  return PET_CODEX_STATUS_LABELS[status];
}

export function getPetCodexStatusColor(status: PetCodexStatus): string {
  return PET_CODEX_STATUS_COLORS[status];
}

export function readPetCodexEnabled(): boolean {
  return window.localStorage.getItem(PET_CODEX_ENABLED_STORAGE_KEY) === "1";
}

export function writePetCodexEnabled(enabled: boolean) {
  window.localStorage.setItem(PET_CODEX_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
}
