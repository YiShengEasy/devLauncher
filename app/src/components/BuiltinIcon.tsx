import type { BuiltinFeature } from "@/types/actions";

interface BuiltinIconProps {
  feature: BuiltinFeature;
  size?: number;
}

export function BuiltinIcon({ feature, size = 20 }: BuiltinIconProps) {
  const s = size;
  switch (feature) {
    case "clipboard":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="clip-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" />
              <stop offset="1" stopColor="#818cf8" />
            </linearGradient>
          </defs>
          {/* Top clip */}
          <path d="M9 3h6" stroke="url(#clip-grad)" strokeWidth="2.2" strokeLinecap="round" />
          {/* Board outline */}
          <rect x="4" y="5" width="16" height="17" rx="2.5" stroke="url(#clip-grad)" strokeWidth="1.8" fill="none" />
          {/* Content lines */}
          <path d="M8 11h8M8 15h6" stroke="url(#clip-grad)" strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
        </svg>
      );
    case "json":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="json-grad" x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#34d399" />
              <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          {/* Left brace */}
          <path
            d="M9 3C7 3 6 4.2 6 6v2.5c0 1.2-.8 2-2 2.5 1.2.5 2 1.3 2 2.5V18c0 1.8 1 3 3 3"
            stroke="url(#json-grad)" strokeWidth="1.8" strokeLinecap="round" fill="none"
          />
          {/* Right brace */}
          <path
            d="M15 3c2 0 3 1.2 3 3v2.5c0 1.2.8 2 2 2.5-1.2.5-2 1.3-2 2.5V18c0 1.8-1 3-3 3"
            stroke="url(#json-grad)" strokeWidth="1.8" strokeLinecap="round" fill="none"
          />
          {/* Center dot */}
          <circle cx="12" cy="11" r="1.5" fill="url(#json-grad)" opacity="0.6" />
        </svg>
      );
    case "totp":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="totp-grad" x1="2" y1="0" x2="22" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7c3aed" />
              <stop offset="1" stopColor="#db2777" />
            </linearGradient>
          </defs>
          {/* Shield outline */}
          <path
            d="M12 3l7 3.5V12c0 4-2.8 7-7 9-4.2-2-7-5-7-9V6.5L12 3Z"
            stroke="url(#totp-grad)" strokeWidth="1.8" strokeLinejoin="round" fill="none"
          />
          {/* Center dot — matches JSON icon language */}
          <circle cx="12" cy="12" r="2.5" fill="url(#totp-grad)" opacity="0.6" />
          {/* Check mark — conveys verification / token validated */}
          <path d="M9.5 12l1.5 1.5 3-3.5" stroke="url(#totp-grad)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "remotedesk":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="remotedesk-grad" x1="3" y1="4" x2="21" y2="21" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" />
              <stop offset="1" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <rect x="3.5" y="5" width="17" height="11" rx="2" stroke="url(#remotedesk-grad)" strokeWidth="1.8" />
          <path d="M9 20h6M12 16v4" stroke="url(#remotedesk-grad)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8 10h5l-2-2M13 10l-2 2" stroke="url(#remotedesk-grad)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        </svg>
      );
    case "terminal":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="terminal-grad" x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5eead4" />
              <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="url(#terminal-grad)" strokeWidth="1.8" />
          <path d="M7.5 10l2.5 2-2.5 2M12.5 14h4" stroke="url(#terminal-grad)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "screenshotai":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="screenshotai-grad" x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fb7185" />
              <stop offset="0.55" stopColor="#facc15" />
              <stop offset="1" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="url(#screenshotai-grad)" strokeWidth="1.8" />
          <circle cx="8" cy="10" r="2.5" fill="url(#screenshotai-grad)" />
          <path d="M12 9.5h5M12 13.5h3.5" stroke="url(#screenshotai-grad)" strokeWidth="1.7" strokeLinecap="round" opacity="0.75" />
          <path d="M6.5 17l3-3 2 2 2.5-2.5 3.5 3.5" stroke="url(#screenshotai-grad)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "screenshot":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="screenshot-grad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0a84ff" />
              <stop offset="1" stopColor="#5ac8fa" />
            </linearGradient>
          </defs>
          <path d="M7 4H5.5A1.5 1.5 0 004 5.5V7M17 4h1.5A1.5 1.5 0 0120 5.5V7M7 20H5.5A1.5 1.5 0 014 18.5V17M17 20h1.5a1.5 1.5 0 001.5-1.5V17" stroke="url(#screenshot-grad)" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="7" y="8" width="10" height="8" rx="1.5" stroke="url(#screenshot-grad)" strokeWidth="1.8" />
          <path d="M9.5 13.5l2-2 1.5 1.5 1.5-1.5 2 2.5" stroke="url(#screenshot-grad)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
        </svg>
      );
    case "webaccounts":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="webaccounts-grad" x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#34d399" />
              <stop offset="1" stopColor="#60a5fa" />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="8.5" stroke="url(#webaccounts-grad)" strokeWidth="1.8" />
          <path d="M4.5 12h15M12 3.5c2.2 2.4 3.2 5.2 3.2 8.5s-1 6.1-3.2 8.5M12 3.5C9.8 5.9 8.8 8.7 8.8 12s1 6.1 3.2 8.5" stroke="url(#webaccounts-grad)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14.7 13.8h2.2v3.6h-5.4v-3.6h1.1v-1.2a2.1 2.1 0 014.2 0v1.2h-1.2v-1.2a.9.9 0 10-1.8 0v1.2h.9Z" fill="url(#webaccounts-grad)" opacity="0.82" />
        </svg>
      );
    case "quickmemory":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="quickmemory-grad" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5eead4" />
              <stop offset="0.52" stopColor="#facc15" />
              <stop offset="1" stopColor="#fb7185" />
            </linearGradient>
          </defs>
          <path d="M7 4h8.5L19 7.5V20H7a2 2 0 01-2-2V6a2 2 0 012-2Z" stroke="url(#quickmemory-grad)" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M15.5 4V8H19" stroke="url(#quickmemory-grad)" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M8.5 11h7M8.5 14h5M8.5 17h6.5" stroke="url(#quickmemory-grad)" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
        </svg>
      );
  }
}
