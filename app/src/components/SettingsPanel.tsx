import { useKeyboardStore } from "@/store/useKeyboardStore";
import { saveConfig } from "@/api/config";
import { DEFAULT_THEME } from "@/types/actions";
import type { ThemeConfig } from "@/types/actions";

const PRESET_COLORS = [
  "#10121f", "#1a1a2e", "#0d1117", "#1e1b2e",
  "#0f172a", "#1c1917", "#14532d", "#1e3a5f",
];

const THEME_PRESETS: { name: string; theme: ThemeConfig }[] = [
  {
    name: "默认",
    theme: { ...DEFAULT_THEME },
  },
  {
    name: "macOS",
    theme: {
      bgColor: "#1e1e2e",
      bgOpacity: 0.68,
      blurRadius: 44,
      borderColor: "#ffffff18",
      keyBgOpacity: 0.06,
    },
  },
  {
    name: "纯黑",
    theme: {
      bgColor: "#000000",
      bgOpacity: 0.92,
      blurRadius: 0,
      borderColor: "#333333",
      keyBgOpacity: 0.05,
    },
  },
  {
    name: "半透明",
    theme: {
      bgColor: "#080808",
      bgOpacity: 0.38,
      blurRadius: 56,
      borderColor: "#ffffff10",
      keyBgOpacity: 0.02,
    },
  },
  {
    name: "午夜蓝",
    theme: {
      bgColor: "#0a1128",
      bgOpacity: 0.80,
      blurRadius: 28,
      borderColor: "#3b82f640",
      keyBgOpacity: 0.04,
    },
  },
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const theme = useKeyboardStore((s) => s.theme);
  const setTheme = useKeyboardStore((s) => s.setTheme);

  const persist = (partial: Partial<ThemeConfig>) => {
    setTheme(partial);
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  };

  const applyPreset = (t: ThemeConfig) => {
    setTheme({ ...t });
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  };

  const resetTheme = () => {
    setTheme({ ...DEFAULT_THEME });
    setTimeout(async () => {
      const cfg = useKeyboardStore.getState().config;
      if (cfg) await saveConfig(cfg);
    }, 0);
  };

  const LABEL: React.CSSProperties = {
    fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 500, marginBottom: 4,
  };
  const ROW: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
  };

  return (
    <div className="settings-panel" style={{
      width: "100%", height: "100%",
      padding: "14px 12px",
      display: "flex", flexDirection: "column", gap: 2,
      overflowY: "auto",
      boxSizing: "border-box",
    }}>
      <style>{`
        .settings-panel input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          padding: 0 !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          height: 14px;
          min-height: 14px;
        }
        .settings-panel input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          margin-top: -5px;
          border: 2px solid rgba(255,255,255,0.9);
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        .settings-panel input[type="range"]::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
          background: rgba(255,255,255,0.12);
        }
        .settings-panel input[type="color"] {
          padding: 0 !important;
          border: none !important;
          background: none !important;
          box-shadow: none !important;
          outline: none !important;
          -webkit-appearance: none;
          appearance: none;
          cursor: pointer;
        }
        .settings-panel input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 0;
        }
        .settings-panel input[type="color"]::-webkit-color-swatch {
          border: none;
          border-radius: 4px;
        }
        .settings-panel button {
          padding: 0;
          border: none;
          background: none;
          box-shadow: none;
          outline: none;
          color: inherit;
          font-family: inherit;
          font-size: inherit;
          font-weight: inherit;
        }
      `}</style>

      <div style={{
        fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)",
        marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M10 13a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.5 3.5l2 2M14.5 14.5l2 2M14.5 5.5l2-2M3.5 16.5l2-2"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          主题设置
        </div>
        <button
          onClick={onClose}
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            cursor: "pointer", padding: 0, outline: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1,
            transition: "all 0.12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
        >✕</button>
      </div>

      {/* Theme Presets */}
      <div style={LABEL}>预设主题</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
        {THEME_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => applyPreset(p.theme)}
            style={{
              padding: "3px 10px", borderRadius: 5,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 500,
              cursor: "pointer", transition: "all 0.12s", outline: "none",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Background Color */}
      <div style={LABEL}>背景色</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => persist({ bgColor: c })}
            style={{
              width: 22, height: 22, borderRadius: 5,
              background: c, border: theme.bgColor === c ? "2px solid #3b82f6" : "1px solid rgba(255,255,255,0.15)",
              cursor: "pointer", outline: "none",
            }}
          />
        ))}
        <label style={{
          width: 22, height: 22, borderRadius: 5,
          border: "1px dashed rgba(255,255,255,0.25)",
          cursor: "pointer", position: "relative", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>+</span>
          <input
            type="color"
            value={theme.bgColor}
            onChange={(e) => persist({ bgColor: e.target.value })}
            style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
          />
        </label>
      </div>

      {/* Background Opacity */}
      <div style={LABEL}>背景透明度</div>
      <div style={ROW}>
        <input
          type="range" min={0.1} max={1} step={0.02}
          value={theme.bgOpacity}
          onChange={(e) => persist({ bgOpacity: parseFloat(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", width: 32, textAlign: "right", fontFamily: "monospace" }}>
          {Math.round(theme.bgOpacity * 100)}%
        </span>
      </div>

      {/* Blur Radius */}
      <div style={LABEL}>模糊强度</div>
      <div style={ROW}>
        <input
          type="range" min={0} max={60} step={2}
          value={theme.blurRadius}
          onChange={(e) => persist({ blurRadius: parseFloat(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", width: 32, textAlign: "right", fontFamily: "monospace" }}>
          {theme.blurRadius}px
        </span>
      </div>

      {/* Border Color */}
      <div style={LABEL}>边框色</div>
      <div style={{ ...ROW, marginBottom: 14 }}>
        <input
          type="color"
          value={theme.borderColor.slice(0, 7)}
          onChange={(e) => persist({ borderColor: e.target.value + "1a" })}
          style={{ width: 22, height: 22, borderRadius: 4, cursor: "pointer" }}
        />
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
          {theme.borderColor.slice(0, 7)}
        </span>
      </div>

      {/* Unbound Key Opacity */}
      <div style={LABEL}>空键背景透明度</div>
      <div style={ROW}>
        <input
          type="range" min={0} max={0.3} step={0.01}
          value={theme.keyBgOpacity}
          onChange={(e) => persist({ keyBgOpacity: parseFloat(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", width: 32, textAlign: "right", fontFamily: "monospace" }}>
          {Math.round(theme.keyBgOpacity * 100)}%
        </span>
      </div>
    </div>
  );
}
