import type { BuiltinFeature } from "@/types/actions";
import { IconBase } from "./IconBase";
import { iconColors, withIconColor } from "./palette";
import type { IconComponent, IconProps } from "./types";

export function ClipboardIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.clipboard)}>
      <rect x="5" y="5.5" width="14" height="16" rx="2.4" />
      <path d="M9 5.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v1.5" />
      <path d="M8.5 11h7M8.5 15h5" opacity={0.55} />
    </IconBase>
  );
}

export function JsonIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.json)}>
      <path d="M9 4C7 4 6 5.25 6 7.1v1.8c0 1.55-.75 2.55-2.25 3.1C5.25 12.55 6 13.55 6 15.1v1.8C6 18.75 7 20 9 20" />
      <path d="M15 4c2 0 3 1.25 3 3.1v1.8c0 1.55.75 2.55 2.25 3.1-1.5.55-2.25 1.55-2.25 3.1v1.8c0 1.85-1 3.1-3 3.1" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function TotpIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.totp)}>
      <path d="M12 3.5 19 7v5.3c0 4.1-2.75 6.8-7 8.2-4.25-1.4-7-4.1-7-8.2V7l7-3.5Z" />
      <path d="m9.2 12.3 1.8 1.8 3.8-4.3" />
      <path d="M12 6.8v1.8M12 17.2v.2" opacity={0.55} />
    </IconBase>
  );
}

export function RemoteDeskIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.remotedesk)}>
      <rect x="3.5" y="5" width="17" height="11.5" rx="2.2" />
      <path d="M9 20h6M12 16.5V20" />
      <path d="M8.2 10.4h5l-2-2.1M13.2 10.4l-2 2.1" opacity={0.65} />
    </IconBase>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.terminal)}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
      <path d="m7.5 10 2.6 2-2.6 2" />
      <path d="M12.5 14h4" />
    </IconBase>
  );
}

export function ScreenshotIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.screenshot)}>
      <path d="M7 4H5.6A1.6 1.6 0 0 0 4 5.6V7M17 4h1.4A1.6 1.6 0 0 1 20 5.6V7M7 20H5.6A1.6 1.6 0 0 1 4 18.4V17M17 20h1.4a1.6 1.6 0 0 0 1.6-1.6V17" />
      <rect x="7" y="8" width="10" height="8" rx="1.6" />
      <path d="m9.3 13.4 2-2 1.7 1.7 1.7-1.6 2 2.3" opacity={0.65} />
    </IconBase>
  );
}

export function ScreenshotAiIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.screenshotai)}>
      <rect x="3.8" y="5" width="16.4" height="14" rx="2.4" />
      <path d="M7 9.5h4M7 13h3" opacity={0.55} />
      <path d="M15.3 8.2 16 10l1.8.7L16 11.4l-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" fill="currentColor" stroke="none" />
      <path d="m7 17 3.2-3 2 2 2.2-2.4L17 17" />
    </IconBase>
  );
}

export function WebAccountsIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.webaccounts)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M4.5 12h15M12 3.5c2.15 2.35 3.2 5.15 3.2 8.5M12 3.5C9.85 5.85 8.8 8.65 8.8 12" opacity={0.6} />
      <rect x="10.2" y="12.2" width="6.1" height="4.8" rx="1" />
      <path d="M11.6 12.2v-1a1.7 1.7 0 0 1 3.4 0v1" />
    </IconBase>
  );
}

export function QuickMemoryIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.quickmemory)}>
      <path d="M7 4h8.2L19 7.8V20H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M15.2 4v4H19" />
      <path d="M8.5 11h7M8.5 14h5M8.5 17h6.5" opacity={0.6} />
    </IconBase>
  );
}

export const BUILTIN_ICON_COMPONENTS = {
  clipboard: ClipboardIcon,
  json: JsonIcon,
  totp: TotpIcon,
  remotedesk: RemoteDeskIcon,
  terminal: TerminalIcon,
  screenshot: ScreenshotIcon,
  screenshotai: ScreenshotAiIcon,
  webaccounts: WebAccountsIcon,
  quickmemory: QuickMemoryIcon,
} satisfies Record<BuiltinFeature, IconComponent>;
