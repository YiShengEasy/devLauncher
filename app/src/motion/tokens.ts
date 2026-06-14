export const motionDuration = {
  instant: 0.08,
  micro: 0.14,
  quick: 0.2,
  panel: 0.32,
  dialog: 0.38,
  morph: 0.46,
  playful: 0.62,
} as const;

export const motionEase = {
  standard: "power2.out",
  emphasized: "power3.out",
  enter: "back.out(1.18)",
  exit: "power2.in",
  morph: "power3.inOut",
  playful: "elastic.out(0.85, 0.42)",
} as const;

export const motionStagger = {
  tight: 0.025,
  normal: 0.04,
  loose: 0.065,
} as const;
