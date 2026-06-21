import type { ActionType } from "@/types/actions";
import { IconBase } from "./IconBase";
import { iconColors, withIconColor } from "./palette";
import type { IconComponent, IconProps } from "./types";

export function AppGridIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.app)}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </IconBase>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.folder)}>
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4.2l2 2.3H18A2.5 2.5 0 0 1 20.5 9.8v6.7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" />
      <path d="M3.8 9h16.4" opacity={0.55} />
    </IconBase>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.file)}>
      <path d="M6.5 3.5h7L18 8v10.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
      <path d="M13.5 3.8V8h4.2" opacity={0.7} />
      <path d="M8 12h8M8 15.5h5.5" opacity={0.55} />
    </IconBase>
  );
}

export function UrlIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.url)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4" opacity={0.7} />
      <path d="M12 3.5c2.15 2.35 3.25 5.15 3.25 8.5S14.15 18.15 12 20.5" />
      <path d="M12 3.5C9.85 5.85 8.75 8.65 8.75 12s1.1 6.15 3.25 8.5" />
    </IconBase>
  );
}

export function ServerTerminalIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.ssh)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
      <path d="M3.5 8.2h17" opacity={0.55} />
      <path d="M7.5 12l2.4 2-2.4 2" />
      <path d="M12.5 16h4" />
    </IconBase>
  );
}

export function ScriptIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.script)}>
      <path d="M8.5 7 5 12l3.5 5" />
      <path d="M15.5 7 19 12l-3.5 5" />
      <path d="M13.5 4.5 10.5 19.5" opacity={0.75} />
    </IconBase>
  );
}

export function SystemIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.system)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.1M12 18.4v2.1M3.5 12h2.1M18.4 12h2.1" />
      <path d="m6 6 1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" opacity={0.75} />
    </IconBase>
  );
}

export function BuiltinToolIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.builtin)}>
      <rect x="4.5" y="5" width="15" height="14" rx="2.5" />
      <path d="M8 5V3.8A1.8 1.8 0 0 1 9.8 2h4.4A1.8 1.8 0 0 1 16 3.8V5" />
      <path d="M8 11h8M8 15h5.5" opacity={0.6} />
    </IconBase>
  );
}

export function PluginIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.plugin)}>
      <rect x="5" y="5" width="6" height="6" rx="1.6" />
      <rect x="13" y="5" width="6" height="6" rx="1.6" />
      <rect x="5" y="13" width="6" height="6" rx="1.6" />
      <path d="M14 16h5M16.5 13.5v5" />
    </IconBase>
  );
}

export const ACTION_ICON_COMPONENTS = {
  app: AppGridIcon,
  folder: FolderIcon,
  file: FileIcon,
  url: UrlIcon,
  ssh: ServerTerminalIcon,
  script: ScriptIcon,
  system: SystemIcon,
  builtin: BuiltinToolIcon,
  plugin: PluginIcon,
} satisfies Record<ActionType, IconComponent>;
