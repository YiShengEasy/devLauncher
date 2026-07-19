import { useState } from "react";
import type { ReactNode } from "react";
import type { Action, ActionType, AppAction, BuiltinAction, BuiltinFeature, PluginAction, ScriptAction, UrlAction } from "@/types/actions";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { BuiltinIcon } from "@/components/BuiltinIcon";
import { ACTION_ICON_COMPONENTS } from "@/icons";
import type { IconComponent } from "@/icons";
import { iconColors } from "@/icons/palette";
import { actionIconAccent, actionIconMonogram } from "./actionIconIdentity";

const TYPE_ICONS: Record<ActionType, IconComponent> = ACTION_ICON_COMPONENTS;

function IconTile({
  children,
  size,
  accent,
  label,
}: {
  children: ReactNode;
  size: number;
  accent: string;
  label: string;
}) {
  return (
    <div
      aria-hidden="true"
      title={label}
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        position: "relative",
        flexShrink: 0,
        overflow: "hidden",
        borderRadius: Math.max(5, size * 0.25),
        color: accent,
        border: `1px solid ${accent}48`,
        background: [
          `radial-gradient(circle at 28% 18%, ${accent}35, transparent 52%)`,
          "linear-gradient(145deg, rgba(255,255,255,0.13), rgba(255,255,255,0.035))",
        ].join(", "),
        boxShadow: [
          "inset 0 1px 0 rgba(255,255,255,0.16)",
          "inset 0 -1px 0 rgba(0,0,0,0.18)",
          `0 3px 8px ${accent}20`,
        ].join(", "),
      }}
    >
      {children}
    </div>
  );
}

function ImageTile({ src, action, size, onError }: {
  src: string;
  action: Action;
  size: number;
  onError: () => void;
}) {
  return (
    <IconTile size={size} accent={actionIconAccent(action)} label={action.name}>
      <img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: "cover",
          padding: Math.max(1, Math.round(size * 0.06)),
          borderRadius: Math.max(4, size * 0.21),
        }}
        referrerPolicy="no-referrer"
        onError={onError}
        alt=""
      />
    </IconTile>
  );
}

function IdentityIcon({
  action,
  Icon,
  size,
}: {
  action: Action;
  Icon: IconComponent;
  size: number;
}) {
  const accent = actionIconAccent(action);
  const monogram = actionIconMonogram(action);
  const showTypeMark = size >= 24;

  return (
    <IconTile size={size} accent={accent} label={action.name}>
      <span
        style={{
          color: "rgba(255,255,255,0.95)",
          fontSize: Math.max(8, size * 0.38),
          fontWeight: 760,
          lineHeight: 1,
          letterSpacing: 0,
          textShadow: "0 1px 3px rgba(0,0,0,0.52)",
        }}
      >
        {monogram}
      </span>
      {showTypeMark && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 2,
            bottom: 2,
            width: Math.max(9, size * 0.34),
            height: Math.max(9, size * 0.34),
            borderRadius: Math.max(3, size * 0.1),
            display: "grid",
            placeItems: "center",
            color: accent,
            background: "rgba(8,12,20,0.82)",
            border: "1px solid rgba(255,255,255,0.13)",
          }}
        >
          <Icon size={Math.max(7, size * 0.24)} color={accent} decorative />
        </span>
      )}
    </IconTile>
  );
}

function SemanticIcon({
  action,
  size,
  accent,
  children,
}: {
  action: Action;
  size: number;
  accent: string;
  children: ReactNode;
}) {
  return (
    <IconTile size={size} accent={accent} label={action.name}>
      <span aria-hidden="true" style={{ display: "grid", placeItems: "center", color: accent }}>
        {children}
      </span>
    </IconTile>
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
      <ImageTile
        src={cachedSrc}
        action={action}
        size={size}
        onError={() => setFailedCachedSrc(cachedSrc)}
      />
    );
  }

  if (!faviconUrl || failedUrl === faviconUrl) {
    return <>{fallback}</>;
  }

  return (
    <ImageTile
      src={faviconUrl}
      action={action}
      size={size}
      onError={() => setFailedUrl(faviconUrl)}
    />
  );
}

interface ActionIconProps {
  action: Action;
  size?: number;
}

export function ActionIcon({ action, size = 36 }: ActionIconProps) {
  const Icon = TYPE_ICONS[action.type];
  const appIcons = useKeyboardStore(state => state.appIcons);
  const pluginIcons = useKeyboardStore(state => state.pluginIcons);
  const pluginIcon = action.type === "plugin" ? pluginIcons[(action as PluginAction).pluginId] : null;
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const actionImageSrc = pluginIcon ?? action.icon;

  if (actionImageSrc && failedImageSrc !== actionImageSrc) {
    return (
      <ImageTile
        src={actionImageSrc}
        action={action}
        size={size}
        onError={() => setFailedImageSrc(actionImageSrc)}
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
          <ImageTile
            src={cachedIconSrc}
            action={action}
            size={size}
            onError={() => setFailedImageSrc(cachedIconSrc)}
          />
        );
      }
    }
  }

  if (action.type === "system") {
    return (
      <IdentityIcon action={action} Icon={Icon} size={size} />
    );
  }

  if (action.type === "builtin") {
    const feature = (action as BuiltinAction).feature as BuiltinFeature;
    const accent = iconColors[feature as keyof typeof iconColors] ?? actionIconAccent(action);
    return (
      <SemanticIcon action={action} size={size} accent={accent}>
        <BuiltinIcon feature={feature} size={size * 0.68} />
      </SemanticIcon>
    );
  }

  if (action.type === "script" && (action as ScriptAction).shell === "terminal") {
    return (
      <SemanticIcon action={action} size={size} accent={iconColors.terminal}>
        <BuiltinIcon feature="terminal" size={size * 0.68} />
      </SemanticIcon>
    );
  }

  if (action.type === "url") {
    const fallback = <IdentityIcon action={action} Icon={Icon} size={size} />;
    return <UrlFavicon action={action as UrlAction} size={size} fallback={fallback} />;
  }

  return <IdentityIcon action={action} Icon={Icon} size={size} />;
}
