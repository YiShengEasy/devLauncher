import type { Action, ActionType, AppAction, BuiltinAction, BuiltinFeature } from "@/types/actions";
import { ACTION_TYPE_META } from "@/types/actions";
import { useKeyboardStore } from "@/store/useKeyboardStore";
import { BuiltinIcon } from "@/components/BuiltinIcon";

// ── Type SVG Icons ──────────────────────────────────

function IconApp() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <rect x="2" y="2" width="7" height="7" rx="1.5"/>
      <rect x="11" y="2" width="7" height="7" rx="1.5"/>
      <rect x="2" y="11" width="7" height="7" rx="1.5"/>
      <rect x="11" y="11" width="7" height="7" rx="1.5"/>
    </svg>
  );
}
function IconFolder() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path d="M2 5a2 2 0 0 1 2-2h3.5l2 2H16a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z"/>
    </svg>
  );
}
function IconFile() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path d="M4 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H4zm7 1v5h5"/>
    </svg>
  );
}
function IconUrl() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <ellipse cx="10" cy="10" rx="4" ry="8" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function IconSsh() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <rect x="1" y="3" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <polyline points="4,8 7,11 4,14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconScript() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <polyline points="5,7 2,10 5,13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <polyline points="15,7 18,10 15,13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="4" x2="8" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconSystem() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M14.36 5.64l1.42-1.42M4.22 15.78l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}
function IconClipboard() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="10" height="14" rx="2"/>
      <path d="M8 3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/>
      <line x1="8" y1="9" x2="12" y2="9"/>
      <line x1="8" y1="12" x2="12" y2="12"/>
    </svg>
  );
}

const TYPE_ICONS: Record<ActionType, React.FC> = {
  app: IconApp,
  folder: IconFolder,
  file: IconFile,
  url: IconUrl,
  ssh: IconSsh,
  script: IconScript,
  system: IconSystem,
  builtin: IconClipboard,
};

// ── ActionIcon component ────────────────────────────

interface ActionIconProps {
  action: Action;
  size?: number;
}

export function ActionIcon({ action, size = 36 }: ActionIconProps) {
  const meta = ACTION_TYPE_META[action.type];
  const Icon = TYPE_ICONS[action.type];
  const appIcons = useKeyboardStore(state => state.appIcons);

  // If custom icon image path provided, render it
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

  // For app type, try to use extracted exe icon
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

  // For system actions, show the SVG icon centered
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
        <Icon />
      </div>
    );
  }

  // For builtin actions, use the dedicated BuiltinIcon
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

  // App: first letter avatar with color
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
