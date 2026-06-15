import { useState } from "react";
import type { ReactNode } from "react";
import type { Action, ActionType, AppAction, BuiltinAction, BuiltinFeature, UrlAction } from "@/types/actions";
import { ACTION_TYPE_META } from "@/types/actions";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { ACTION_ICON_COMPONENTS } from "@/icons";
import type { IconComponent } from "@/icons";

const TYPE_ICONS: Record<ActionType, IconComponent> = ACTION_ICON_COMPONENTS;

function websiteOrigin(target: string): string | null {
  try {
    const url = new URL(target.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function UrlFavicon({ action, size, fallback }: { action: UrlAction; size: number; fallback: ReactNode }) {
  const favicons = useKeyboardStore(state => state.favicons);
  const origin = websiteOrigin(action.target);
  const cachedSrc = origin ? favicons[origin] : null;
  const faviconUrl = origin ? `${origin}/favicon.ico` : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [failedCachedSrc, setFailedCachedSrc] = useState<string | null>(null);

  if (cachedSrc && failedCachedSrc !== cachedSrc) {
    return (
      <img
        src={cachedSrc}
        width={size}
        height={size}
        style={{
          borderRadius: size * 0.22,
          objectFit: "cover",
          background: "rgba(255,255,255,0.92)",
        }}
        referrerPolicy="no-referrer"
        onError={() => setFailedCachedSrc(cachedSrc)}
        alt={action.name}
      />
    );
  }

  if (!faviconUrl || failedUrl === faviconUrl) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={faviconUrl}
      width={size}
      height={size}
      style={{
        borderRadius: size * 0.22,
        objectFit: "cover",
        background: "rgba(255,255,255,0.92)",
      }}
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(faviconUrl)}
      alt={action.name}
    />
  );
}

interface ActionIconProps {
  action: Action;
  size?: number;
}

export function ActionIcon({ action, size = 36 }: ActionIconProps) {
  const meta = ACTION_TYPE_META[action.type];
  const Icon = TYPE_ICONS[action.type];
  const appIcons = useKeyboardStore(state => state.appIcons);

  if (action.icon) {
    return (
      <img
        src={action.icon}
        width={size}
        height={size}
        style={{ borderRadius: size * 0.22, objectFit: "cover" }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        alt={action.name}
      />
    );
  }

  if (action.type === "app") {
    const target = (action as AppAction).target;
    const cachedIcon = appIcons[target];
    if (cachedIcon) {
      return (
        <img
          src={`data:image/png;base64,${cachedIcon}`}
          width={size}
          height={size}
          style={{ borderRadius: size * 0.15, objectFit: "cover" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          alt={action.name}
        />
      );
    }
  }

  if (action.type === "system") {
    return (
      <div
        style={{
          width: size, height: size,
          borderRadius: size * 0.22,
          background: meta.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white",
          fontSize: size * 0.45,
        }}
      >
        <Icon size={size * 0.5} />
      </div>
    );
  }

  if (action.type === "builtin") {
    const feature = (action as BuiltinAction).feature as BuiltinFeature;
    return (
      <div
        style={{
          width: size, height: size,
          borderRadius: size * 0.22,
          background: meta.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <BuiltinIcon feature={feature} size={size * 0.78} />
      </div>
    );
  }

  if (action.type === "url") {
    const fallback = (
      <div
        style={{
          width: size, height: size,
          borderRadius: size * 0.22,
          background: meta.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white",
        }}
      >
        <Icon size={size * 0.5} />
      </div>
    );
    return <UrlFavicon action={action as UrlAction} size={size} fallback={fallback} />;
  }

  if (action.type === "folder") {
    return (
      <div
        style={{
          width: size, height: size,
          borderRadius: size * 0.22,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
          color: meta.color,
        }}
      >
        <Icon size={size} />
      </div>
    );
  }

  if (action.type === "ssh") {
    return (
      <div
        style={{
          width: size, height: size,
          borderRadius: size * 0.22,
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: meta.color,
        }}
      >
        <Icon size={size} />
      </div>
    );
  }

  const letter = action.name.charAt(0).toUpperCase();

  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: size * 0.22,
        background: meta.bg,
        display: "flex",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <span style={{
        fontSize: size * 0.46,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: "-0.5px",
        color: "rgba(255,255,255,0.92)",
      }}>
        {letter}
      </span>
    </div>
  );
}
