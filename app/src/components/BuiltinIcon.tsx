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
  }
}
