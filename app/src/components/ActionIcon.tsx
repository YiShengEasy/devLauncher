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
function IconFolder({ size = 16 }: { size?: number }) {
  // Mac-style folder: square-ish body with tab, proportioned for square viewBox
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" style={{ display: "block" }}>
      {/* Tab */}
      <path d="M2 10V8a2 2 0 0 1 2-2h5.2l1.8 2.5H2z" fill="#3b82f6"/>
      {/* Body shadow/depth */}
      <rect x="2" y="10" width="20" height="12" rx="2" fill="#1e40af"/>
      {/* Body main */}
      <rect x="2" y="10" width="20" height="11" rx="2" fill="#2563eb"/>
      {/* Top highlight */}
      <rect x="2" y="10" width="20" height="2.5" rx="1" fill="rgba(255,255,255,0.22)"/>
      {/* Front face */}
      <rect x="2" y="11.5" width="20" height="9.5" rx="2" fill="#1d4ed8"/>
      {/* Shine */}
      <rect x="2" y="11.5" width="20" height="1.5" fill="rgba(255,255,255,0.14)"/>
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
function IconSsh({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" style={{ display: "block" }}>
      {/* Terminal window */}
      <rect x="1" y="2" width="18" height="16" rx="2.5" fill="#0d1117" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7"/>
      {/* Title bar */}
      <path d="M1 4.5a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 19 4.5V7H1V4.5z" fill="rgba(255,255,255,0.06)"/>
      {/* Separator */}
      <line x1="1" y1="7" x2="19" y2="7" stroke="rgba(255,255,255,0.1)" strokeWidth="0.6"/>
      {/* Traffic lights */}
      <circle cx="4.3" cy="4.75" r="1.1" fill="#ff5f57"/>
      <circle cx="7.5" cy="4.75" r="1.1" fill="#febc2e"/>
      <circle cx="10.7" cy="4.75" r="1.1" fill="#28c840"/>
      {/* Prompt chevron */}
      <polyline points="3.5,10 6,12 3.5,14" fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Cursor underline */}
      <line x1="7.5" y1="14" x2="12" y2="14" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round"/>
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

  // Folder: always show folder SVG icon
  if (action.type === "folder") {
    return (
      <div
        style={{
          width: size, height: size,
          borderRadius: size * 0.22,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <IconFolder size={size} />
      </div>
    );
  }

  // SSH: always show terminal SVG icon
  if (action.type === "ssh") {
    return (
      <div
        style={{
          width: size, height: size,
          borderRadius: size * 0.22,
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <IconSsh size={size} />
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
