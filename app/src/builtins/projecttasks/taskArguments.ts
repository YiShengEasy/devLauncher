export const MAX_TASK_ARGUMENT_PRESETS = 200;
export const MAX_TASK_ARGUMENT_PRESETS_PER_TASK = 12;
export const MAX_TASK_ARGUMENT_VALUE_LENGTH = 512;

export interface TaskArgumentTarget {
  projectId: string;
  provider: string;
  sourceKey: string;
}

export interface TaskArgumentPreset extends TaskArgumentTarget {
  value: string;
  lastUsedAt: number;
}

function normalizeTarget(value: Partial<TaskArgumentTarget>): TaskArgumentTarget | null {
  const projectId = typeof value.projectId === "string" ? value.projectId.trim() : "";
  const provider = typeof value.provider === "string" ? value.provider.trim() : "";
  const sourceKey = typeof value.sourceKey === "string" ? value.sourceKey.trim() : "";
  return projectId && provider && sourceKey ? { projectId, provider, sourceKey } : null;
}

function normalizePreset(value: unknown): TaskArgumentPreset | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TaskArgumentPreset>;
  const target = normalizeTarget(candidate);
  const argumentValue = typeof candidate.value === "string" ? candidate.value.trim() : "";
  const lastUsedAt = typeof candidate.lastUsedAt === "number" && Number.isFinite(candidate.lastUsedAt)
    ? Math.max(0, candidate.lastUsedAt)
    : 0;
  if (!target || !argumentValue || argumentValue.length > MAX_TASK_ARGUMENT_VALUE_LENGTH) return null;
  return { ...target, value: argumentValue, lastUsedAt };
}

export function taskArgumentTargetKey(target: TaskArgumentTarget): string {
  return `${target.projectId}\u0000${target.provider}\u0000${target.sourceKey}`;
}

function taskArgumentPresetKey(preset: TaskArgumentPreset): string {
  return `${taskArgumentTargetKey(preset)}\u0000${preset.value}`;
}

export function parseTaskArgumentPresets(value: unknown): TaskArgumentPreset[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, TaskArgumentPreset>();
  for (const item of value) {
    const preset = normalizePreset(item);
    if (!preset) continue;
    const key = taskArgumentPresetKey(preset);
    const existing = unique.get(key);
    if (!existing || preset.lastUsedAt > existing.lastUsedAt) unique.set(key, preset);
  }
  return [...unique.values()]
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, MAX_TASK_ARGUMENT_PRESETS);
}

export function taskArgumentPresetsFor(
  presets: TaskArgumentPreset[],
  target: TaskArgumentTarget,
): TaskArgumentPreset[] {
  const key = taskArgumentTargetKey(target);
  return presets
    .filter((preset) => taskArgumentTargetKey(preset) === key)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, MAX_TASK_ARGUMENT_PRESETS_PER_TASK);
}

export function rememberTaskArgumentPreset(
  presets: TaskArgumentPreset[],
  target: TaskArgumentTarget,
  value: string,
  lastUsedAt = Date.now(),
): TaskArgumentPreset[] {
  const normalizedTarget = normalizeTarget(target);
  const normalizedValue = value.trim();
  if (!normalizedTarget || !normalizedValue || normalizedValue.length > MAX_TASK_ARGUMENT_VALUE_LENGTH) {
    return presets;
  }
  const nextPreset: TaskArgumentPreset = {
    ...normalizedTarget,
    value: normalizedValue,
    lastUsedAt,
  };
  const targetKey = taskArgumentTargetKey(nextPreset);
  const sameTask = presets
    .filter((preset) => (
      taskArgumentTargetKey(preset) === targetKey
      && preset.value !== normalizedValue
    ))
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, MAX_TASK_ARGUMENT_PRESETS_PER_TASK - 1);
  const otherTasks = presets.filter((preset) => taskArgumentTargetKey(preset) !== targetKey);
  return parseTaskArgumentPresets([nextPreset, ...sameTask, ...otherTasks]);
}

export function removeTaskArgumentPreset(
  presets: TaskArgumentPreset[],
  target: TaskArgumentTarget,
  value: string,
): TaskArgumentPreset[] {
  const targetKey = taskArgumentTargetKey(target);
  return presets.filter((preset) => (
    taskArgumentTargetKey(preset) !== targetKey || preset.value !== value
  ));
}

export function parseTaskArguments(input: string): string[] {
  const value = input.trim();
  if (!value) return [];
  if (value.length > MAX_TASK_ARGUMENT_VALUE_LENGTH) {
    throw new Error(`参数不能超过 ${MAX_TASK_ARGUMENT_VALUE_LENGTH} 个字符`);
  }

  const argumentsList: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;
  let tokenStarted = false;

  for (const character of value) {
    if (character === "\n" || character === "\r" || character === "\0") {
      throw new Error("参数不能包含换行或空字符");
    }
    if (escaping) {
      token += character;
      escaping = false;
      tokenStarted = true;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaping = true;
      tokenStarted = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      tokenStarted = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (tokenStarted) {
        argumentsList.push(token);
        token = "";
        tokenStarted = false;
      }
      continue;
    }
    if (";|&<>".includes(character)) {
      throw new Error("这里只能填写命令参数，不能包含 Shell 控制符 ; | & < >");
    }
    token += character;
    tokenStarted = true;
  }

  if (escaping) throw new Error("参数末尾不能是转义符");
  if (quote) throw new Error("参数引号没有闭合");
  if (tokenStarted) argumentsList.push(token);
  return argumentsList;
}
