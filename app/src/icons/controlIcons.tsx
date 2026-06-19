import { IconBase } from "./IconBase";
import { iconColors, withIconColor } from "./palette";
import type { IconProps } from "./types";

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.delete)}>
      <path d="M7 7 17 17M17 7 7 17" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.add)}>
      <path d="m5.5 12.5 4.2 4.2 8.8-9.4" />
    </IconBase>
  );
}

export function MinimizeIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.folder)}>
      <path d="M6 12h12" />
    </IconBase>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.settings)}>
      <path d="M8.5 4.5h7l-.9 4.6 3.2 3.2-2 2-3.2-3.2L8 12l-3.5 3.5" />
      <path d="m9.6 14.4-3.9 3.9" opacity={0.65} />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.settings)}>
      <circle cx="12" cy="12" r="3.15" />
      <path d="M19.35 13.45a7.8 7.8 0 0 0 0-2.9l2.05-1.22-2.05-3.56-2.35 1a8.1 8.1 0 0 0-2.5-1.45L14.15 3h-4.3L9.5 5.32A8.1 8.1 0 0 0 7 6.77l-2.35-1L2.6 9.33l2.05 1.22a7.8 7.8 0 0 0 0 2.9L2.6 14.67l2.05 3.56 2.35-1a8.1 8.1 0 0 0 2.5 1.45l.35 2.32h4.3l.35-2.32a8.1 8.1 0 0 0 2.5-1.45l2.35 1 2.05-3.56-2.05-1.22Z" />
    </IconBase>
  );
}

export function AddIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.add)}>
      <path d="M12 5.5v13M5.5 12h13" />
    </IconBase>
  );
}

export function RenameIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.rename)}>
      <path d="M4.5 18.5h15" opacity={0.55} />
      <path d="M13.8 5.2 18.8 10 10 18.2H5.2v-4.8l8.6-8.2Z" />
      <path d="m12.4 6.6 5 4.8" opacity={0.65} />
    </IconBase>
  );
}

export function DeleteIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.delete)}>
      <path d="M5 7h14" />
      <path d="M9.5 7V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6a1.7 1.7 0 0 1 1.7 1.7V7" />
      <path d="M7.5 7.5 8.3 20h7.4l.8-12.5" />
      <path d="M10.5 11v5M13.5 11v5" opacity={0.65} />
    </IconBase>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.copy)}>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15.5V6.8A1.8 1.8 0 0 1 6.8 5h8.7" />
    </IconBase>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.download)}>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </IconBase>
  );
}

export function CaptureIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.capture)}>
      <path d="M7 4H5.6A1.6 1.6 0 0 0 4 5.6V7M17 4h1.4A1.6 1.6 0 0 1 20 5.6V7M7 20H5.6A1.6 1.6 0 0 1 4 18.4V17M17 20h1.4a1.6 1.6 0 0 0 1.6-1.6V17" />
      <circle cx="12" cy="12" r="3.2" />
    </IconBase>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.retry)}>
      <path d="M19 8.5A7.5 7.5 0 1 0 20 14" />
      <path d="M19 4.5v4h-4" />
    </IconBase>
  );
}
