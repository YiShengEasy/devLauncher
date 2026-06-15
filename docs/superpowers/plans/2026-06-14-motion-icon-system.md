# DevLauncher Motion and Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current stiff CSS/inline animations with a coherent GSAP-driven motion system and a unified SVG icon standard across the existing DevLauncher pages and built-ins.

**Architecture:** Keep business behavior unchanged and add a small frontend-only motion/icon layer under `app/src/motion/` and `app/src/icons/`. GSAP owns orchestrated entrances, exits, entry-mode morphs, list staggers, and micro-interactions; CSS keeps static styling, reduced-motion fallback, and non-orchestrated state colors. SVGs move from scattered inline implementations into typed reusable React icon components with one shared rendering contract.

**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, GSAP, Vitest, CSS custom properties, inline SVG React components.

---

## Current Evidence

- Main desktop app route: `app/src/main.tsx` routes `entry=search`, `entry=pet`, `view=<builtin>`, and the default keyboard app.
- Existing motion is spread across `app/src/index.css`, inline styles in `app/src/App.tsx`, `app/src/entry/SearchPanel.tsx`, `app/src/entry/PetEntryApp.tsx`, `app/src/components/*`, and built-ins.
- Current CSS motion classes include `.motion-panel`, `.motion-dialog`, `.motion-list`, `.entry-mode-shell`, `.entry-switch-burst`, `.pet-shell`, `.pet-ring`, `.pet-action-button`, and `.quick-action-icon`.
- Current icon code is split across `app/src/components/ActionIcon.tsx`, `app/src/components/BuiltinIcon.tsx`, `app/src/entry/PetEntryApp.tsx`, `app/src/entry/BrowserPreviewApp.tsx`, and `app/src/builtins/screenshot/App.tsx`.
- `app/package.json` does not currently list `gsap`.
- The worktree already has unrelated active edits. Implementation must preserve those edits and commit only task-scoped files.

## Motion Design Standard

### Motion Personality

DevLauncher should feel fast, tactile, and slightly playful without slowing down repeated developer workflows.

- **Search and command flows:** crisp, low-latency, keyboard-first, no decorative delay.
- **Keyboard launcher:** soft glass-panel entrance, subtle key response, tab changes that slide content by a few pixels instead of popping.
- **Pet entry:** playful orbit, squash, and arc motion, but actions remain predictable.
- **Built-in utility panels:** calm and utilitarian; use mild panel lift and list reveal, not large bounces.
- **Screenshot tooling:** tool-like precision; no wobble on capture controls.

### Timing Tokens

Use these durations in code:

```ts
export const motionDuration = {
  instant: 0.08,
  micro: 0.14,
  quick: 0.2,
  panel: 0.32,
  dialog: 0.38,
  morph: 0.46,
  playful: 0.62,
} as const;
```

Use these eases:

```ts
export const motionEase = {
  standard: "power2.out",
  emphasized: "power3.out",
  enter: "back.out(1.18)",
  exit: "power2.in",
  morph: "power3.inOut",
  playful: "elastic.out(0.85, 0.42)",
} as const;
```

### Motion Rules

- Animate only `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotation`, `opacity`/`autoAlpha`, `filter` when necessary, and CSS variables.
- Do not animate `width`, `height`, `top`, `left`, `padding`, or `border-radius` for routine interactions. Use transform wrappers for morphs.
- Use `gsap.context()` inside React hooks and call `ctx.revert()` in cleanup.
- Use `gsap.matchMedia()` for `prefers-reduced-motion`.
- Use timelines with labels for multi-stage sequences.
- Use `stagger` for lists instead of nth-child CSS delays.
- Use `overwrite: "auto"` on interactive tweens.
- Keep decorative infinite loops restricted to the pet ring and only while the menu is open.

### Reduced Motion Rules

When `prefers-reduced-motion: reduce` is active:

- Entrances set `autoAlpha: 1`, `x: 0`, `y: 0`, `scale: 1` with duration `0`.
- Hover/press transforms are disabled except color/opacity changes.
- Pet ring shimmer is disabled.
- Mode switches fade between windows without rotation, elastic, or burst effects.

## Icon Design Standard

### SVG Contract

All first-party icons must follow this contract:

- `viewBox="0 0 24 24"`
- `fill="none"` by default
- `stroke="currentColor"` unless a brand or app favicon/image is used
- `strokeWidth={1.8}` for utility icons
- `strokeLinecap="round"`
- `strokeLinejoin="round"`
- default rendered sizes: `16`, `20`, `24`, `28`, `32`
- no inline `<defs>` gradient IDs inside repeated icons
- no emoji as functional icons
- no negative letter spacing inside icon fallback labels
- icon components accept `size`, `className`, `title`, and `decorative`

### Icon Categories

- **Action type icons:** app, folder, file, url, ssh, script, system, builtin.
- **Builtin icons:** clipboard, json, totp, remotedesk, terminal, screenshot, screenshotai, webaccounts, quickmemory.
- **Entry icons:** search, report, clip, keyboard, pet.
- **Window/action controls:** close, minimize, settings, add, rename, delete, copy, download, capture, retry.

### Visual Language

- Utility icons use single-color strokes and inherit color from their container.
- Builtin icons may use a colored container, not unique gradients embedded in each SVG.
- Favicon and extracted app images remain supported and take precedence over generic icons.
- Pet icon can stay pixel-inspired, but it must be implemented as a reusable icon component, not duplicated markup.

## File Structure

Create:

- `app/src/motion/tokens.ts`: shared duration, easing, stagger, and reduced-motion constants.
- `app/src/motion/useGsapContext.ts`: React helper for scoped GSAP contexts.
- `app/src/motion/presets.ts`: reusable entrance, exit, list, button, icon, and panel animation helpers.
- `app/src/motion/useReducedMotion.ts`: browser preference hook used by components that branch behavior.
- `app/src/icons/types.ts`: shared icon prop types.
- `app/src/icons/IconBase.tsx`: standard SVG wrapper.
- `app/src/icons/actionIcons.tsx`: action type icons.
- `app/src/icons/builtinIcons.tsx`: builtin feature icons.
- `app/src/icons/entryIcons.tsx`: pet/search/report/clip/keyboard icons.
- `app/src/icons/controlIcons.tsx`: window and tool control icons.
- `app/src/icons/index.ts`: public exports.
- `app/src/motion/motion.test.ts`: unit tests for reduced-motion and preset target values.
- `app/src/icons/icons.test.tsx`: render tests for icon sizing, titles, and decorative behavior.

Modify:

- `app/package.json`: add `gsap`.
- `app/src/index.css`: remove old keyframe-based orchestration and keep static tokens/classes.
- `app/src/components/ActionIcon.tsx`: use `app/src/icons/actionIcons.tsx`.
- `app/src/components/BuiltinIcon.tsx`: use `app/src/icons/builtinIcons.tsx`.
- `app/src/components/MacWindowControls.tsx`: use control icons and motion class hooks.
- `app/src/App.tsx`: replace inline mode-transition CSS with GSAP timeline hooks.
- `app/src/components/KeyboardPanel.tsx`: use motion hooks for key mount/press feedback only.
- `app/src/components/KeyCell.tsx`: replace `transition: "all ..."` with class and GSAP micro-interaction.
- `app/src/entry/SearchPanel.tsx`: list/quick-action stagger and result selection animation.
- `app/src/entry/PetEntryApp.tsx`: pet menu orbit timeline and keyboard-mode exit timeline.
- `app/src/entry/BrowserPreviewApp.tsx`: reuse the same icons and motion presets for local preview.
- `app/src/components/BindingModal.tsx`: dialog entrance and list reveal.
- `app/src/components/SettingsPanel.tsx`: panel entrance and section reveal.
- `app/src/components/ClipboardPanel.tsx`: list reveal and row press feedback.
- `app/src/builtins/json/App.tsx`: calm panel/list/error reveal.
- `app/src/builtins/totp/App.tsx`: token progress keeps linear width animation; row/button motion uses presets.
- `app/src/builtins/screenshot/App.tsx`: replace inline control SVGs with standardized icons.
- `app/src/builtins/screenshotai/App.tsx`: panel/list reveal.
- `app/src/builtins/remotedesk/App.tsx`: panel/list reveal.
- `app/src/builtins/terminal/App.tsx`: panel reveal only; terminal text is not animated.
- `app/src/builtins/quickmemory/App.tsx`: preserve drag/swap behavior, replace only hover/row feedback.

Do not modify:

- `app/src-tauri/**` unless a compile error exposes a necessary route or window fix.
- `app/src/launcher/actionExecutor.ts` or launcher action behavior.
- `app/src/api/config.ts`, config schema, or keyboard YAML format.

## Task 1: Add GSAP and Motion Tokens

**Files:**
- Modify: `app/package.json`
- Create: `app/src/motion/tokens.ts`
- Create: `app/src/motion/useReducedMotion.ts`
- Create: `app/src/motion/useGsapContext.ts`
- Create: `app/src/motion/presets.ts`
- Test: `app/src/motion/motion.test.ts`

- [ ] **Step 1: Install GSAP dependency**

Run:

```powershell
cd app
npm install gsap@latest
```

Expected: `app/package.json` and `app/package-lock.json` update with a resolved `gsap` dependency, and `npm` exits with code `0`.

- [ ] **Step 2: Create motion tokens**

Create `app/src/motion/tokens.ts`:

```ts
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
```

- [ ] **Step 3: Create reduced-motion hook**

Create `app/src/motion/useReducedMotion.ts`:

```ts
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}
```

- [ ] **Step 4: Create GSAP context helper**

Create `app/src/motion/useGsapContext.ts`:

```ts
import { useLayoutEffect, type DependencyList, type RefObject } from "react";
import gsap from "gsap";

export function useGsapContext(
  scope: RefObject<HTMLElement | null>,
  setup: () => void,
  deps: DependencyList,
) {
  useLayoutEffect(() => {
    if (!scope.current) return;
    const context = gsap.context(setup, scope);
    return () => context.revert();
  }, deps);
}
```

- [ ] **Step 5: Create motion presets**

Create `app/src/motion/presets.ts`:

```ts
import gsap from "gsap";
import { motionDuration, motionEase, motionStagger } from "./tokens";

export function animatePanelEnter(target: gsap.TweenTarget, reduced: boolean) {
  return gsap.fromTo(
    target,
    { autoAlpha: reduced ? 1 : 0, y: reduced ? 0 : 10, scale: reduced ? 1 : 0.985 },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: reduced ? 0 : motionDuration.panel,
      ease: motionEase.enter,
      overwrite: "auto",
    },
  );
}

export function animateDialogEnter(target: gsap.TweenTarget, reduced: boolean) {
  return gsap.fromTo(
    target,
    { autoAlpha: reduced ? 1 : 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.965 },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: reduced ? 0 : motionDuration.dialog,
      ease: motionEase.enter,
      overwrite: "auto",
    },
  );
}

export function animateListEnter(targets: gsap.TweenTarget, reduced: boolean) {
  return gsap.fromTo(
    targets,
    { autoAlpha: reduced ? 1 : 0, y: reduced ? 0 : 7, scale: reduced ? 1 : 0.99 },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: reduced ? 0 : motionDuration.quick,
      ease: motionEase.standard,
      stagger: reduced ? 0 : motionStagger.normal,
      overwrite: "auto",
    },
  );
}

export function pressButton(target: gsap.TweenTarget, reduced: boolean) {
  if (reduced) return gsap.set(target, { scale: 1, y: 0 });
  return gsap.timeline({ defaults: { overwrite: "auto" } })
    .to(target, { scale: 0.97, y: 1, duration: motionDuration.instant, ease: motionEase.exit })
    .to(target, { scale: 1, y: 0, duration: motionDuration.micro, ease: motionEase.standard });
}
```

- [ ] **Step 6: Add motion tests**

Create `app/src/motion/motion.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { prefersReducedMotion } from "./useReducedMotion";

describe("prefersReducedMotion", () => {
  it("returns false when matchMedia is unavailable", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
    expect(prefersReducedMotion()).toBe(false);
    Object.defineProperty(window, "matchMedia", { value: original, configurable: true });
  });

  it("reads the reduce media query", () => {
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", { value: matchMedia, configurable: true });
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });
});
```

- [ ] **Step 7: Verify Task 1**

Run:

```powershell
cd app
npm run test -- app/src/motion/motion.test.ts
npm run build
```

Expected: tests pass and Vite build succeeds.

- [ ] **Step 8: Commit Task 1**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/package.json app/package-lock.json app/src/motion
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: add motion foundation"
```

## Task 2: Build Unified SVG Icon System

**Files:**
- Create: `app/src/icons/types.ts`
- Create: `app/src/icons/IconBase.tsx`
- Create: `app/src/icons/actionIcons.tsx`
- Create: `app/src/icons/builtinIcons.tsx`
- Create: `app/src/icons/entryIcons.tsx`
- Create: `app/src/icons/controlIcons.tsx`
- Create: `app/src/icons/index.ts`
- Test: `app/src/icons/icons.test.tsx`

- [ ] **Step 1: Create icon prop types**

Create `app/src/icons/types.ts`:

```ts
import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  title?: string;
  decorative?: boolean;
}
```

- [ ] **Step 2: Create IconBase**

Create `app/src/icons/IconBase.tsx`:

```tsx
import type { PropsWithChildren } from "react";
import type { IconProps } from "./types";

export function IconBase({
  size = 24,
  title,
  decorative = !title,
  children,
  ...props
}: PropsWithChildren<IconProps>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}
```

- [ ] **Step 3: Create action icons**

Create `app/src/icons/actionIcons.tsx` with icons for `app`, `folder`, `file`, `url`, `ssh`, `script`, `system`, and `builtin`. Each icon must use `IconBase`. Example:

```tsx
import { IconBase } from "./IconBase";
import type { IconProps } from "./types";

export function FolderIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4.2l2 2.3H18A2.5 2.5 0 0 1 20.5 9.8v6.7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" />
      <path d="M3.8 9h16.4" opacity={0.55} />
    </IconBase>
  );
}
```

- [ ] **Step 4: Create builtin icons**

Create `app/src/icons/builtinIcons.tsx` and export:

```ts
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
} as const;
```

Each icon uses `IconBase` and `currentColor`. Do not use per-icon gradients.

- [ ] **Step 5: Create entry and control icons**

Create `app/src/icons/entryIcons.tsx` for `SearchIcon`, `ReportIcon`, `ClipIcon`, `KeyboardIcon`, and `PixelPetIcon`.

Create `app/src/icons/controlIcons.tsx` for `CloseIcon`, `MinimizeIcon`, `SettingsIcon`, `AddIcon`, `RenameIcon`, `DeleteIcon`, `CopyIcon`, `DownloadIcon`, `CaptureIcon`, and `RetryIcon`.

- [ ] **Step 6: Create public export**

Create `app/src/icons/index.ts`:

```ts
export * from "./types";
export * from "./IconBase";
export * from "./actionIcons";
export * from "./builtinIcons";
export * from "./entryIcons";
export * from "./controlIcons";
```

- [ ] **Step 7: Add icon tests**

Create `app/src/icons/icons.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IconBase, FolderIcon } from "./index";

describe("IconBase", () => {
  it("uses the 24px icon contract", () => {
    const html = renderToStaticMarkup(<IconBase size={20}><path d="M4 4h16v16H4z" /></IconBase>);
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke="currentColor"');
  });

  it("renders accessible titles when provided", () => {
    const html = renderToStaticMarkup(<FolderIcon title="Folder" decorative={false} />);
    expect(html).toContain('role="img"');
    expect(html).toContain("<title>Folder</title>");
  });
});
```

- [ ] **Step 8: Verify Task 2**

Run:

```powershell
cd app
npm run test -- app/src/icons/icons.test.tsx
npm run build
```

Expected: tests pass and no TypeScript icon prop errors.

- [ ] **Step 9: Commit Task 2**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/icons
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: add unified icon system"
```

## Task 3: Migrate Shared Action and Builtin Icons

**Files:**
- Modify: `app/src/components/ActionIcon.tsx`
- Modify: `app/src/components/BuiltinIcon.tsx`
- Modify: `app/src/components/MacWindowControls.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/BindingModal.tsx`
- Modify: `app/src/entry/SearchPanel.tsx`

- [ ] **Step 1: Replace inline action SVGs**

In `app/src/components/ActionIcon.tsx`, remove local `IconApp`, `IconFolder`, `IconFile`, `IconUrl`, `IconSsh`, `IconScript`, `IconSystem`, and `IconClipboard`. Import standardized icons:

```ts
import {
  AppGridIcon,
  BuiltinToolIcon,
  FileIcon,
  FolderIcon,
  ScriptIcon,
  ServerTerminalIcon,
  SettingsIcon,
  UrlIcon,
} from "@/icons";
```

Set:

```ts
const TYPE_ICONS: Record<ActionType, React.FC<{ size?: number }>> = {
  app: AppGridIcon,
  folder: FolderIcon,
  file: FileIcon,
  url: UrlIcon,
  ssh: ServerTerminalIcon,
  script: ScriptIcon,
  system: SettingsIcon,
  builtin: BuiltinToolIcon,
};
```

- [ ] **Step 2: Replace builtin switch implementation**

In `app/src/components/BuiltinIcon.tsx`, replace the full SVG switch with:

```tsx
import { BUILTIN_ICON_COMPONENTS } from "@/icons";
import type { BuiltinFeature } from "@/types/actions";

interface BuiltinIconProps {
  feature: BuiltinFeature;
  size?: number;
  title?: string;
}

export function BuiltinIcon({ feature, size = 20, title }: BuiltinIconProps) {
  const Icon = BUILTIN_ICON_COMPONENTS[feature];
  return <Icon size={size} title={title} decorative={!title} />;
}
```

- [ ] **Step 3: Replace window controls markup**

In `app/src/components/MacWindowControls.tsx`, use `CloseIcon` and `MinimizeIcon` for hover-visible symbols. Keep existing close/minimize behavior unchanged.

- [ ] **Step 4: Replace settings and page action symbols**

In `app/src/App.tsx`, replace the settings inline SVG with `SettingsIcon`, replace plus text with `AddIcon`, and replace tab context menu emoji with `RenameIcon` and `DeleteIcon`.

- [ ] **Step 5: Verify shared icon migration**

Run:

```powershell
cd app
npm run build
```

Expected: build succeeds and there are no duplicate gradient ID warnings in repeated builtin icons.

- [ ] **Step 6: Commit Task 3**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/components/ActionIcon.tsx app/src/components/BuiltinIcon.tsx app/src/components/MacWindowControls.tsx app/src/App.tsx app/src/components/BindingModal.tsx app/src/entry/SearchPanel.tsx
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "refactor: standardize shared icons"
```

## Task 4: Replace Global CSS Keyframe Motion with GSAP Hooks

**Files:**
- Modify: `app/src/index.css`
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/BindingModal.tsx`
- Modify: `app/src/components/SettingsPanel.tsx`
- Modify: `app/src/components/ClipboardPanel.tsx`

- [ ] **Step 1: Remove old orchestration keyframes**

In `app/src/index.css`, delete these keyframes and animation assignments:

```css
@keyframes dl-panel-enter
@keyframes dl-dialog-enter
@keyframes dl-list-enter
@keyframes dl-pet-enter
@keyframes dl-mode-burst
@keyframes dl-ring-shimmer
```

Keep `.glass`, `.motion-scroll-area`, `.motion-loading`, and reduced-motion CSS. Replace `.motion-panel`, `.motion-dialog`, and `.motion-list` with static hook classes:

```css
.motion-panel,
.motion-dialog,
.motion-list > * {
  will-change: transform, opacity;
}

.motion-icon {
  display: inline-grid;
  place-items: center;
  will-change: transform;
}
```

- [ ] **Step 2: Add refs and GSAP panel enter to `App.tsx`**

In `app/src/App.tsx`, add:

```ts
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import { animateDialogEnter, animatePanelEnter, animateListEnter } from "@/motion/presets";
```

Inside `App`, add:

```ts
const rootPanelRef = useRef<HTMLDivElement>(null);
const settingsDialogRef = useRef<HTMLDivElement>(null);
const reducedMotion = useReducedMotion();

useGsapContext(rootPanelRef, () => {
  animatePanelEnter(rootPanelRef.current, reducedMotion);
}, [reducedMotion]);
```

Attach `ref={rootPanelRef}` to the main `.glass` panel.

- [ ] **Step 3: Animate settings dialog with GSAP**

Attach `ref={settingsDialogRef}` to the inner settings dialog panel and call:

```ts
useGsapContext(settingsDialogRef, () => {
  if (showSettings) animateDialogEnter(settingsDialogRef.current, reducedMotion);
}, [showSettings, reducedMotion]);
```

- [ ] **Step 4: Apply dialog/list presets to shared panels**

In `BindingModal.tsx`, `SettingsPanel.tsx`, and `ClipboardPanel.tsx`, add a root ref and call `animateDialogEnter` or `animatePanelEnter`. For list containers, add a ref and call:

```ts
animateListEnter(listRef.current?.children ?? [], reducedMotion);
```

- [ ] **Step 5: Verify no old keyframes remain**

Run:

```powershell
rg "dl-panel-enter|dl-dialog-enter|dl-list-enter|dl-pet-enter|dl-mode-burst|dl-ring-shimmer|animation:" app/src
```

Expected: no old keyframe references remain. Any remaining `animation:` must be justified by a specific non-GSAP browser behavior; otherwise remove it.

- [ ] **Step 6: Verify Task 4**

Run:

```powershell
cd app
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit Task 4**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/index.css app/src/App.tsx app/src/components/BindingModal.tsx app/src/components/SettingsPanel.tsx app/src/components/ClipboardPanel.tsx
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "refactor: move shared motion to gsap"
```

## Task 5: Redesign Search Entry Motion

**Files:**
- Modify: `app/src/entry/SearchPanel.tsx`
- Modify: `app/src/entry/SearchEntryApp.tsx`

- [ ] **Step 1: Add panel and list refs**

In `SearchPanel.tsx`, create refs for shell, results list, and quick-actions strip:

```ts
const shellRef = useRef<HTMLDivElement>(null);
const resultsRef = useRef<HTMLDivElement>(null);
const quickActionsRef = useRef<HTMLDivElement>(null);
const reducedMotion = useReducedMotion();
```

- [ ] **Step 2: Animate search shell entrance**

Call:

```ts
useGsapContext(shellRef, () => {
  animatePanelEnter(shellRef.current, reducedMotion);
}, [reducedMotion]);
```

Attach `ref={shellRef}` to the root `div`.

- [ ] **Step 3: Animate quick actions**

When `isEmptyQuery` is true, animate `quickActionsRef.current.children` with `animateListEnter`. Add `ref={quickActionsRef}` to the quick-action container.

- [ ] **Step 4: Animate search results**

When `query` changes and `results.length > 0`, animate `resultsRef.current.children` with a tight stagger. Use `overwrite: "auto"` so fast typing does not stack tweens.

- [ ] **Step 5: Add selection motion without layout shift**

On selected result change, animate only the selected button:

```ts
gsap.fromTo(selectedButton, { x: reducedMotion ? 0 : -3 }, { x: 0, duration: reducedMotion ? 0 : 0.16, ease: "power2.out", overwrite: "auto" });
```

- [ ] **Step 6: Verify Search**

Run:

```powershell
cd app
npm run build
npm run dev
```

Open `http://localhost:1420/?entry=search` in the in-app browser.

Acceptance:

- Search panel enters without popping.
- Quick actions reveal with a short stagger under 250ms total.
- Typing quickly does not create delayed animation backlog.
- Arrow selection moves feel responsive and do not resize rows.
- Escape still closes/hides in Tauri runtime.

- [ ] **Step 7: Commit Task 5**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/entry/SearchPanel.tsx app/src/entry/SearchEntryApp.tsx
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: refine search motion"
```

## Task 6: Redesign Pet Entry and Mode Switch Motion

**Files:**
- Modify: `app/src/entry/PetEntryApp.tsx`
- Modify: `app/src/entry/BrowserPreviewApp.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/icons/entryIcons.tsx`

- [ ] **Step 1: Replace duplicated pet icons**

Replace `PetActionIcon` and duplicated preview SVGs with `SearchIcon`, `ReportIcon`, `ClipIcon`, and `KeyboardIcon` from `app/src/icons/entryIcons.tsx`.

- [ ] **Step 2: Add pet shell refs**

In `PetEntryApp.tsx`, add refs:

```ts
const shellRef = useRef<HTMLDivElement>(null);
const ringRef = useRef<HTMLDivElement>(null);
const centerButtonRef = useRef<HTMLButtonElement>(null);
const reducedMotion = useReducedMotion();
```

- [ ] **Step 3: Animate pet entrance**

Use a GSAP timeline:

```ts
const tl = gsap.timeline({ defaults: { overwrite: "auto" } });
tl.fromTo(centerButtonRef.current, {
  autoAlpha: reducedMotion ? 1 : 0,
  scale: reducedMotion ? 1 : 0.72,
  rotation: reducedMotion ? 0 : -10,
}, {
  autoAlpha: 1,
  scale: 1,
  rotation: 0,
  duration: reducedMotion ? 0 : 0.42,
  ease: "back.out(1.25)",
});
```

- [ ] **Step 4: Animate pet menu open/close**

When `open` changes, animate ring and action buttons with a timeline:

```ts
const buttons = ringRef.current?.querySelectorAll("[data-pet-action]");
const tl = gsap.timeline({ defaults: { overwrite: "auto" } });
tl.to(ringRef.current, {
  autoAlpha: open ? 1 : 0,
  scale: open ? 1 : 0.82,
  duration: reducedMotion ? 0 : 0.22,
  ease: open ? "back.out(1.12)" : "power2.in",
});
tl.fromTo(buttons, {
  autoAlpha: open ? 0 : 1,
  scale: open ? 0.68 : 1,
}, {
  autoAlpha: open ? 1 : 0,
  scale: open ? 1 : 0.68,
  duration: reducedMotion ? 0 : 0.22,
  stagger: reducedMotion ? 0 : { each: 0.035, from: "center" },
  ease: open ? "back.out(1.3)" : "power2.in",
}, "<");
```

- [ ] **Step 5: Replace main-to-pet switch burst**

In `App.tsx`, replace `.entry-switch-burst` CSS animation with a GSAP timeline that scales and fades the main panel toward the pet anchor. Keep the existing Rust command `switch_to_pet_mode` and timeout behavior, but set timeout to the timeline duration in milliseconds.

- [ ] **Step 6: Verify Pet**

Run:

```powershell
cd app
npm run build
npm run dev
```

Open `http://localhost:1420/?entry=pet` and `http://localhost:1420/?preview=pet-motion`.

Acceptance:

- Pet menu opens as a clean orbit, not a sudden radial pop.
- Button hover feels playful but text/icons do not skew into unreadability.
- Double-click search still works.
- Drag still works when menu is closed.
- Switching keyboard to pet and pet to keyboard has no frozen intermediate state.
- Reduced-motion mode removes rotation and elastic movement.

- [ ] **Step 7: Commit Task 6**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/entry/PetEntryApp.tsx app/src/entry/BrowserPreviewApp.tsx app/src/App.tsx app/src/icons/entryIcons.tsx
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "feat: redesign pet entry motion"
```

## Task 7: Migrate Built-In Panels and Screenshot Icons

**Files:**
- Modify: `app/src/builtins/json/App.tsx`
- Modify: `app/src/builtins/totp/App.tsx`
- Modify: `app/src/builtins/screenshot/App.tsx`
- Modify: `app/src/builtins/screenshotai/App.tsx`
- Modify: `app/src/builtins/remotedesk/App.tsx`
- Modify: `app/src/builtins/terminal/App.tsx`
- Modify: `app/src/builtins/quickmemory/App.tsx`

- [ ] **Step 1: Add panel entrance to calm utilities**

For JSON, TOTP, ScreenshotAI, RemoteDesk, Terminal, and QuickMemory root panel components, add `rootRef`, `useReducedMotion`, and `animatePanelEnter`.

- [ ] **Step 2: Add list reveal where lists exist**

Apply `animateListEnter` to history/results/profile lists. Do not animate terminal output lines or code editor text.

- [ ] **Step 3: Replace screenshot inline tool icons**

In `app/src/builtins/screenshot/App.tsx`, replace local inline SVG functions for tools/actions with standardized icons from `app/src/icons/controlIcons.tsx`.

- [ ] **Step 4: Preserve QuickMemory drag behavior**

In `app/src/builtins/quickmemory/App.tsx`, keep existing drag/swap state and `transition: "none"` on active drag elements. Only replace hover/press feedback on non-dragging rows.

- [ ] **Step 5: Verify built-ins**

Run:

```powershell
cd app
npm run build
```

Open these preview URLs in the in-app browser where possible:

```text
http://localhost:1420/?view=json
http://localhost:1420/?view=totp
http://localhost:1420/?view=screenshot
http://localhost:1420/?view=screenshotai
http://localhost:1420/?view=remotedesk
http://localhost:1420/?view=terminal
http://localhost:1420/?view=quickmemory
```

Acceptance:

- All built-ins render.
- Utility panels feel consistent but not over-animated.
- TOTP countdown remains linear and readable.
- Screenshot controls use unified icons.
- QuickMemory drag/swap remains stable.

- [ ] **Step 6: Commit Task 7**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src/builtins
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "refactor: unify builtin panel motion and icons"
```

## Task 8: Remove Stiff Inline Transitions and Finalize CSS

**Files:**
- Modify: `app/src/index.css`
- Modify: every file reported by the searches below

- [ ] **Step 1: Search for forbidden transition patterns**

Run:

```powershell
rg "transition: \"all|transition: 'all|transition: all|@keyframes|animation:" app/src
```

Expected: no `transition: all` remains. Any remaining `@keyframes` or `animation:` must be a documented exception in `app/src/index.css`.

- [ ] **Step 2: Replace generic transitions**

Replace each `transition: "all 0.12s"` or equivalent with explicit properties:

```ts
transition: "background-color 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease"
```

For transform interactions, prefer GSAP handlers or:

```ts
transition: "background-color 140ms ease, border-color 140ms ease, color 140ms ease"
```

- [ ] **Step 3: Search for scattered inline SVGs**

Run:

```powershell
rg "<svg|function Icon|Icon[A-Z].*\\(\\)" app/src
```

Expected: first-party functional icons live in `app/src/icons/**`, `ActionIcon.tsx`, or `BuiltinIcon.tsx`. Inline SVG is allowed only for generated app/favicons from images or for a component-specific graphic with a comment explaining why it is not a reusable icon.

- [ ] **Step 4: Verify reduced-motion CSS**

Keep this reduced-motion block in `app/src/index.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Commit Task 8**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add app/src
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "chore: remove legacy stiff motion"
```

## Task 9: Visual QA and Acceptance

**Files:**
- No required source edits unless QA finds defects.
- Create: `docs/motion-icon-acceptance.md`

- [ ] **Step 1: Create acceptance checklist**

Create `docs/motion-icon-acceptance.md`:

```md
# Motion and Icon Acceptance

## Global

- [ ] No `transition: all` remains in `app/src`.
- [ ] No old `dl-*` keyframe orchestration remains.
- [ ] `prefers-reduced-motion: reduce` removes rotation, elastic, shimmer, and stagger.
- [ ] `npm run build` passes.
- [ ] `npm run test` passes.

## Icons

- [ ] First-party icons use `IconBase`.
- [ ] Functional SVGs use `viewBox="0 0 24 24"`.
- [ ] Builtin icons inherit `currentColor`.
- [ ] Favicon/app image fallback behavior still works.
- [ ] No emoji is used as a functional command icon.

## Pages

- [ ] Keyboard launcher opens with a soft panel entrance.
- [ ] Search opens fast and result selection does not lag.
- [ ] Pet menu opens as an orbit and remains draggable when closed.
- [ ] Settings and binding dialogs enter consistently.
- [ ] Clipboard rows reveal consistently.
- [ ] JSON/TOTP/RemoteDesk/Screenshot/ScreenshotAI/Terminal/QuickMemory render and remain usable.

## Interaction

- [ ] Close/minimize controls still work.
- [ ] Search Escape still closes.
- [ ] Keyboard page tabs still switch and rename.
- [ ] QuickMemory drag/swap behavior still works.
- [ ] Screenshot controls still capture/save/cancel as before.
```

- [ ] **Step 2: Run automated verification**

Run:

```powershell
cd app
npm run test
npm run build
```

Expected: all tests pass and build succeeds.

- [ ] **Step 3: Run source audits**

Run:

```powershell
rg "transition: \"all|transition: 'all|transition: all|dl-panel-enter|dl-dialog-enter|dl-list-enter|dl-pet-enter|dl-mode-burst|dl-ring-shimmer" app/src
rg "<svg" app/src
```

Expected:

- First command returns no matches.
- Second command returns only `app/src/icons/**`, `ActionIcon.tsx` image fallback wrappers if any, or explicitly justified local graphics.

- [ ] **Step 4: Run browser visual checks**

Start the dev server:

```powershell
cd app
npm run dev
```

Check:

```text
http://localhost:1420/
http://localhost:1420/?entry=search
http://localhost:1420/?entry=pet
http://localhost:1420/?preview=pet-motion
http://localhost:1420/?view=json
http://localhost:1420/?view=totp
http://localhost:1420/?view=screenshot
http://localhost:1420/?view=screenshotai
http://localhost:1420/?view=remotedesk
http://localhost:1420/?view=terminal
http://localhost:1420/?view=quickmemory
```

Acceptance:

- No blank screen.
- No text/icon overlap.
- No control resizes on hover.
- No delayed animations continue after route switch.
- No icon appears blurry at 16, 20, 24, 28, or 32px.

- [ ] **Step 5: Run Tauri smoke check**

Run:

```powershell
cd app
npm run tauri dev
```

Acceptance:

- Main window drag/hide/minimize still works.
- Builtin windows still open through existing launcher actions.
- Search and pet entry windows still show through their shortcuts or commands.
- No console error from GSAP cleanup on window close/hide.

- [ ] **Step 6: Commit QA docs**

```powershell
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher add docs/motion-icon-acceptance.md
git -c safe.directory=D:/goworkspace/src/aidk/dev-launcher commit -m "docs: add motion and icon acceptance checklist"
```

## Final Implementation Acceptance

The implementation is complete only when all of these are true:

- `npm run test` passes in `app`.
- `npm run build` passes in `app`.
- `rg "transition: \"all|transition: 'all|transition: all|dl-panel-enter|dl-dialog-enter|dl-list-enter|dl-pet-enter|dl-mode-burst|dl-ring-shimmer" app/src` returns no matches.
- `app/src/icons/**` owns the reusable SVG system.
- `ActionIcon` and `BuiltinIcon` delegate to the new icon system.
- `SearchPanel`, `PetEntryApp`, `App`, shared modals, and built-in panels use GSAP presets for orchestrated motion.
- `prefers-reduced-motion: reduce` has been manually checked.
- Existing Tauri window behavior is preserved: drag, hide, minimize, close, topmost behavior, builtin opening.
- No feature behavior changes were introduced outside motion and icon rendering.

## Self-Review

- Spec coverage: The plan covers GSAP setup, motion tokens, reduced-motion behavior, icon standards, page-specific migrations, source audits, visual QA, and acceptance criteria.
- Placeholder scan: No open-ended implementation placeholders remain.
- Type consistency: The plan uses `IconProps`, `IconBase`, `motionDuration`, `motionEase`, `useReducedMotion`, `useGsapContext`, and preset function names consistently across tasks.
