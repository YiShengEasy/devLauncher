import { useState } from "react";
import type { ReactNode } from "react";
import type { Action, ActionType, AppAction, BuiltinAction, BuiltinFeature, PluginAction, ScriptAction, UrlAction } from "@/types/actions";
import { ACTION_TYPE_META } from "@/types/actions";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { ACTION_ICON_COMPONENTS } from "@/icons";
import type { IconComponent } from "@/icons";

const TYPE_ICONS: Record<ActionType, IconComponent> = ACTION_ICON_COMPONENTS;

function LineIconShell({ children, size, color }: { children: ReactNode; size: number; color: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        color,
        filter: `drop-shadow(0 0 5px ${color}66) drop-shadow(0 1px 2px rgba(0,0,0,0.42))`,
      }}
    >
      {children}
    </div>
  );
}

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
  const pluginIcons = useKeyboardStore(state => state.pluginIcons);
  const pluginIcon = action.type === "plugin" ? pluginIcons[(action as PluginAction).pluginId] : null;
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const actionImageSrc = pluginIcon ?? action.icon;

  if (actionImageSrc && failedImageSrc !== actionImageSrc) {
    return (
      <img
        src={actionImageSrc}
        width={size}
        height={size}
        style={{ borderRadius: size * 0.22, objectFit: "cover" }}
        onError={() => setFailedImageSrc(actionImageSrc)}
        alt={action.name}
      />
    );
  }

  if (action.type === "app") {
    const target = (action as AppAction).target;
    const cachedIcon = appIcons[target];
    if (cachedIcon) {
      const cachedIconSrc = `data:image/png;base64,${cachedIcon}`;
      if (failedImageSrc !== cachedIconSrc) {
        return (
          <img
            src={cachedIconSrc}
            width={size}
            height={size}
            style={{ borderRadius: size * 0.15, objectFit: "cover" }}
            onError={() => setFailedImageSrc(cachedIconSrc)}
            alt={action.name}
          />
        );
      }
    }
  }

  if (action.type === "system") {
    return (
      <LineIconShell size={size} color={meta.color}>
        <Icon size={size} />
      </LineIconShell>
    );
  }

  if (action.type === "builtin") {
    const feature = (action as BuiltinAction).feature as BuiltinFeature;
    return (
      <LineIconShell size={size} color={meta.color}>
        <BuiltinIcon feature={feature} size={size} />
      </LineIconShell>
    );
  }

  if (action.type === "script" && (action as ScriptAction).shell === "terminal") {
    return (
      <LineIconShell size={size} color={meta.color}>
        <BuiltinIcon feature="terminal" size={size} />
      </LineIconShell>
    );
  }

  if (action.type === "url") {
    const fallback = (
      <LineIconShell size={size} color={meta.color}>
        <Icon size={size} />
      </LineIconShell>
    );
    return <UrlFavicon action={action as UrlAction} size={size} fallback={fallback} />;
  }

  if (action.type === "folder") {
    return (
      <LineIconShell size={size} color={meta.color}>
        <Icon size={size} />
      </LineIconShell>
    );
  }

  if (action.type === "ssh") {
    return (
      <LineIconShell size={size} color={meta.color}>
        <Icon size={size} />
      </LineIconShell>
    );
  }

  const letter = action.name.charAt(0).toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        color: meta.color,
        filter: `drop-shadow(0 0 5px ${meta.color}66) drop-shadow(0 1px 2px rgba(0,0,0,0.42))`,
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
