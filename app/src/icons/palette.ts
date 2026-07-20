import type { IconProps } from "./types";

export const iconColors = {
  app: "#60a5fa",
  folder: "#fbbf24",
  file: "#cbd5e1",
  url: "#38bdf8",
  ssh: "#34d399",
  script: "#a78bfa",
  system: "#f97316",
  builtin: "#f472b6",
  plugin: "#a7f3d0",
  workflow: "#fb7185",

  clipboard: "#22d3ee",
  json: "#a78bfa",
  totp: "#34d399",
  remotedesk: "#60a5fa",
  terminal: "#4ade80",
  screenshot: "#f59e0b",
  screenshotai: "#c084fc",
  webaccounts: "#38bdf8",
  quickmemory: "#facc15",
  projecttasks: "#2dd4bf",

  search: "#93c5fd",
  report: "#fbbf24",
  clip: "#22d3ee",
  keyboard: "#c4b5fd",
  pet: "#f9a8d4",

  settings: "#93c5fd",
  add: "#34d399",
  rename: "#fbbf24",
  delete: "#fb7185",
  copy: "#22d3ee",
  download: "#60a5fa",
  capture: "#f59e0b",
  retry: "#a78bfa",
} as const;

export function withIconColor(props: IconProps, color: string): IconProps {
  if (props.color || props.style?.color) return props;
  return { ...props, color };
}
