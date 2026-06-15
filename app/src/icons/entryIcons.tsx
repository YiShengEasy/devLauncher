import { IconBase } from "./IconBase";
import { iconColors, withIconColor } from "./palette";
import type { IconProps } from "./types";

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.search)}>
      <circle cx="10.8" cy="10.8" r="5.8" />
      <path d="m15.2 15.2 4.3 4.3" />
    </IconBase>
  );
}

export function ReportIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.report)}>
      <path d="M6.5 3.5h8L18 7v13.5H6.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
      <path d="M14.5 3.8V7H18" />
      <path d="M8 11h8M8 14.5h8M8 18h5" opacity={0.6} />
    </IconBase>
  );
}

export function ClipIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.clip)}>
      <path d="m8.2 12.5 5.9-5.9a3.2 3.2 0 1 1 4.5 4.5l-7 7a4.6 4.6 0 0 1-6.5-6.5l7.1-7.1" />
      <path d="m13.2 9.5-5.7 5.7a1.5 1.5 0 0 0 2.1 2.1l5.9-5.9" opacity={0.65} />
    </IconBase>
  );
}

export function KeyboardIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.keyboard)}>
      <rect x="3.5" y="6" width="17" height="12" rx="2.2" />
      <path d="M7 10h.1M10.5 10h.1M14 10h.1M17.5 10h.1M7 13.5h.1M10.5 13.5h3.1M17.5 13.5h.1" />
    </IconBase>
  );
}

export function PixelPetIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.pet)}>
      <path d="M7 9V6h3v2h4V6h3v3h2v7h-2v2H7v-2H5V9h2Z" />
      <path d="M9 12h.1M15 12h.1" />
      <path d="M10 16h4" opacity={0.75} />
      <path d="M5 10H3M21 10h-2" opacity={0.55} />
    </IconBase>
  );
}
