import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import gsap from "gsap";
import { ClipIcon, KeyboardIcon, PixelPetIcon, ReportIcon, SearchIcon } from "@/icons/entryIcons";
import { motionDuration, motionEase, motionStagger } from "@/motion/tokens";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import {
  getStoredEntryPosition,
  setStoredEntryPosition,
  type EntryWindowPosition,
} from "./windowPosition";

const KEYBOARD_RETURN_ANIMATION_KEY = "devlauncher:keyboard-return-animation";
const PET_RETURN_ANIMATION_KEY = "devlauncher:pet-return-animation";

const shellStyle: CSSProperties = {
  width: "100vw",
  height: "100vh",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  color: "rgba(255,255,255,0.92)",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const centerButtonStyle: CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: 76,
  height: 76,
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "linear-gradient(145deg, rgba(24,31,45,0.96), rgba(14,18,28,0.96))",
  boxShadow: "0 14px 38px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.18)",
  cursor: "grab",
  display: "grid",
  placeItems: "center",
  userSelect: "none",
  transition: "box-shadow 180ms ease, filter 180ms ease",
  touchAction: "none",
};

const ringStyle: CSSProperties = {
  position: "absolute",
  width: 232,
  height: 232,
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(12,16,24,0.76) 0 32%, rgba(12,16,24,0.94) 33% 65%, rgba(255,255,255,0.08) 66% 67%, transparent 68%)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 18px 46px rgba(0,0,0,0.38)",
  opacity: 0,
  transform: "scale(0.72)",
  pointerEvents: "none",
  overflow: "visible",
};

const actionButtonStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 60,
  height: 60,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(22,27,38,0.96)",
  color: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  padding: 0,
  outline: "none",
  display: "grid",
  placeItems: "center",
  boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)",
  transform: "translate(-50%, -50%) scale(0.55)",
  opacity: 0,
  transition: "background 120ms ease, box-shadow 160ms ease, filter 160ms ease",
};

const menuItems = [
  { label: "搜索", title: "打开搜索", x: 0, y: -92, action: "search" },
  { label: "报告", title: "打开截图报告", x: 92, y: 0, action: "report" },
  { label: "剪贴", title: "打开剪贴板", x: 0, y: 92, action: "clip" },
  { label: "键盘", title: "切换到键盘模式", x: -92, y: 0, action: "keyboard" },
] as const;

type PetAction = (typeof menuItems)[number]["action"];

function PetActionIcon({ action }: { action: PetAction }) {
  const iconProps = { size: 28, decorative: true };
  if (action === "search") return <SearchIcon {...iconProps} />;
  if (action === "report") return <ReportIcon {...iconProps} />;
  if (action === "clip") return <ClipIcon {...iconProps} />;
  return <KeyboardIcon {...iconProps} />;
}

async function readCurrentPosition(): Promise<EntryWindowPosition> {
  const position = await getCurrentWindow().outerPosition();
  return { x: position.x, y: position.y };
}

async function savePetPosition(): Promise<EntryWindowPosition> {
  const position = await readCurrentPosition();
  setStoredEntryPosition("pet", position);
  return position;
}

async function restorePetPosition() {
  const position = getStoredEntryPosition("pet");
  if (!position) return;
  await getCurrentWindow().setPosition(new PhysicalPosition(position.x, position.y));
}

export function PetEntryApp() {
  const [open, setOpen] = useState(false);
  const [modeTransition, setModeTransition] = useState<"idle" | "to-keyboard">("idle");
  const shellRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const centerButtonRef = useRef<HTMLButtonElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const reducedMotion = useReducedMotion();

  const resetPetVisualState = () => {
    const shell = shellRef.current;
    const ring = ringRef.current;
    const centerButton = centerButtonRef.current;

    gsap.killTweensOf([shell, ring, centerButton]);
    gsap.set(shell, { autoAlpha: 1, scale: 1, filter: "none", clearProps: "transform" });
    gsap.set(ring, { scaleX: 1, scaleY: 1 });
    gsap.set(centerButton, { autoAlpha: 1, scale: open ? 0.92 : 1, rotation: open ? 45 : 0, filter: "none" });
  };

  const playPetReturnTimeline = () => {
    const shell = shellRef.current;
    const centerButton = centerButtonRef.current;
    if (!shell || !centerButton) return;

    if (reducedMotion) {
      resetPetVisualState();
      return;
    }

    gsap.timeline({ defaults: { overwrite: "auto" } })
      .fromTo(shell, {
        autoAlpha: 0,
        scale: 0.88,
        filter: "blur(1px) brightness(1.26) saturate(1.22)",
      }, {
        autoAlpha: 1,
        scale: 1,
        filter: "none",
        duration: motionDuration.playful,
        ease: motionEase.enter,
      }, 0)
      .fromTo(centerButton, {
        autoAlpha: 0,
        scale: 0.84,
        rotation: -18,
        filter: "brightness(1.36) saturate(1.3)",
      }, {
        autoAlpha: 1,
        scale: open ? 0.92 : 1,
        rotation: 0,
        filter: "none",
        duration: motionDuration.playful,
        ease: motionEase.enter,
      }, 0.04);
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const currentWindow = getCurrentWindow();

    restorePetPosition().catch(console.error);
    currentWindow
      .onMoved(({ payload }) => {
        setStoredEntryPosition("pet", { x: payload.x, y: payload.y });
      })
      .then((value) => {
        unlisten = value;
      })
      .catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const handleWindowFocus = () => {
      const shouldAnimateReturn = window.localStorage.getItem(PET_RETURN_ANIMATION_KEY) === "1";
      if (!shouldAnimateReturn) {
        resetPetVisualState();
        return;
      }
      window.localStorage.removeItem(PET_RETURN_ANIMATION_KEY);
      playPetReturnTimeline();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleWindowFocus);
    };
  }, [open, reducedMotion]);

  useGsapContext(shellRef, () => {
    const centerButton = centerButtonRef.current;
    if (!centerButton) return;

    gsap.fromTo(
      centerButton,
      {
        autoAlpha: reducedMotion ? 1 : 0,
        scale: reducedMotion ? 1 : 0.72,
        rotation: reducedMotion ? 0 : -10,
      },
      {
        autoAlpha: 1,
        scale: 1,
        rotation: 0,
        duration: reducedMotion ? 0 : motionDuration.playful,
        ease: reducedMotion ? motionEase.standard : motionEase.playful,
        overwrite: "auto",
      },
    );
  }, [reducedMotion]);

  useGsapContext(ringRef, () => {
    const ring = ringRef.current;
    const centerButton = centerButtonRef.current;
    if (!ring || !centerButton) return;

    const actionButtons = menuItems
      .map((item) => ring.querySelector<HTMLButtonElement>(`[data-pet-action="${item.action}"]`))
      .filter((button): button is HTMLButtonElement => Boolean(button));

    const tl = gsap.timeline({ defaults: { overwrite: "auto" } });
    if (open) {
      tl.to(ring, {
        autoAlpha: 1,
        scale: 1,
        duration: reducedMotion ? 0 : motionDuration.quick,
        ease: motionEase.standard,
      }, 0)
        .to(centerButton, {
          scale: 0.92,
          rotation: reducedMotion ? 0 : 45,
          duration: reducedMotion ? 0 : motionDuration.quick,
          ease: motionEase.standard,
        }, 0)
        .to(actionButtons, {
          autoAlpha: 1,
          scale: 1,
          x: (index) => menuItems[index]?.x ?? 0,
          y: (index) => menuItems[index]?.y ?? 0,
          xPercent: -50,
          yPercent: -50,
          duration: reducedMotion ? 0 : motionDuration.playful,
          ease: reducedMotion ? motionEase.standard : motionEase.playful,
          stagger: reducedMotion ? 0 : motionStagger.tight,
        }, reducedMotion ? 0 : 0.03);
    } else {
      tl.to(actionButtons, {
        autoAlpha: 0,
        scale: 0.55,
        x: 0,
        y: 0,
        xPercent: -50,
        yPercent: -50,
        duration: reducedMotion ? 0 : motionDuration.quick,
        ease: motionEase.exit,
        stagger: reducedMotion ? 0 : {
          each: motionStagger.tight,
          from: "end",
        },
      }, 0)
        .to(ring, {
          autoAlpha: 0,
          scale: 0.72,
          duration: reducedMotion ? 0 : motionDuration.quick,
          ease: motionEase.exit,
        }, reducedMotion ? 0 : 0.06)
        .to(centerButton, {
          scale: 1,
          rotation: 0,
          filter: "none",
          duration: reducedMotion ? 0 : motionDuration.quick,
          ease: motionEase.standard,
        }, 0);
    }
  }, [open, reducedMotion]);

  async function openSearch() {
    await invoke("show_search_window");
  }

  async function openScreenshotReport() {
    await invoke("show_screenshotai_window");
  }

  async function openClipboard() {
    await invoke("show_clipboard_window");
  }

  async function switchToKeyboard() {
    if (modeTransition !== "idle") return;
    setModeTransition("to-keyboard");
    await savePetPosition();
    const duration = reducedMotion ? 0 : motionDuration.playful;
    const durationMs = Math.round(duration * 1000);
    const shell = shellRef.current;
    const ring = ringRef.current;
    const centerButton = centerButtonRef.current;
    const actionButtons = ring
      ? menuItems
          .map((item) => ring.querySelector<HTMLButtonElement>(`[data-pet-action="${item.action}"]`))
          .filter((button): button is HTMLButtonElement => Boolean(button))
      : [];
    const tl = gsap.timeline({ defaults: { overwrite: "auto" } });

    tl.to(shell, {
      autoAlpha: reducedMotion ? 1 : 0,
      scale: reducedMotion ? 1 : 1.08,
      filter: reducedMotion ? "none" : "blur(1px) brightness(1.22) saturate(1.16)",
      duration,
      ease: reducedMotion ? motionEase.standard : motionEase.morph,
    }, 0)
      .to(actionButtons, {
      autoAlpha: 0,
      scale: reducedMotion ? 1 : 0.82,
      x: 0,
      y: 0,
      xPercent: -50,
      yPercent: -50,
        duration: reducedMotion ? 0 : motionDuration.panel,
        ease: motionEase.exit,
      stagger: reducedMotion ? 0 : {
        each: motionStagger.tight,
        from: "end",
      },
      }, 0)
      .to(ring, {
        autoAlpha: reducedMotion ? 0 : 0.18,
        scale: reducedMotion ? 0.72 : 1.08,
        duration,
        ease: motionEase.morph,
      }, 0)
      .to(centerButton, {
        autoAlpha: reducedMotion ? 1 : 0,
        scale: reducedMotion ? 1 : 1.12,
        rotation: reducedMotion ? 0 : 18,
        filter: reducedMotion ? "none" : "brightness(1.35) saturate(1.35)",
        duration,
        ease: motionEase.morph,
      }, 0);

    window.setTimeout(() => {
      gsap.set(shell, { autoAlpha: 1, scale: 1, filter: "none", clearProps: "transform" });
      gsap.set(ring, { scaleX: 1, scaleY: 1, scale: 0.72, autoAlpha: 0 });
      gsap.set(centerButton, { scale: 1, rotation: 0, filter: "none", autoAlpha: 1 });
      window.localStorage.setItem(KEYBOARD_RETURN_ANIMATION_KEY, "1");
      invoke("switch_to_keyboard_mode", { position: getStoredEntryPosition("main") })
        .catch((error) => {
          window.localStorage.removeItem(KEYBOARD_RETURN_ANIMATION_KEY);
          console.error(error);
        })
        .finally(() => setModeTransition("idle"));
    }, durationMs);
  }

  async function runAction(action: PetAction) {
    setOpen(false);
    if (action === "search") await openSearch();
    if (action === "report") await openScreenshotReport();
    if (action === "clip") await openClipboard();
    if (action === "keyboard") await switchToKeyboard();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (open || event.button !== 0) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStartRef.current;
    if (!start || open) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < 10) return;

    pointerStartRef.current = null;
    suppressClickRef.current = true;
    getCurrentWindow()
      .startDragging()
      .then(() => savePetPosition())
      .catch(console.error);
  }

  function handlePointerUp() {
    pointerStartRef.current = null;
    savePetPosition().catch(console.error);
  }

  function handleCenterClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
  }

  return (
    <div ref={shellRef} className="pet-shell" style={shellStyle}>
      <div
        ref={ringRef}
        className={`pet-ring ${open ? "is-open" : ""} ${modeTransition === "to-keyboard" ? "is-switching" : ""}`}
        style={{
          ...ringStyle,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {menuItems.map((item) => (
          <button
            key={item.action}
            className="pet-action-button"
            onClick={() => runAction(item.action).catch(console.error)}
            style={{
              ...actionButtonStyle,
            }}
            data-pet-action={item.action}
            aria-label={item.label}
            title={item.title}
            type="button"
          >
            <PetActionIcon action={item.action} />
          </button>
        ))}
      </div>
      <button
        ref={centerButtonRef}
        aria-label="像素猫入口"
        onClick={handleCenterClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          ...centerButtonStyle,
          cursor: open ? "pointer" : "grab",
          boxShadow: open
            ? "0 8px 24px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.18)"
            : centerButtonStyle.boxShadow,
        }}
        title={open ? "收起菜单" : "展开快捷入口"}
        type="button"
      >
        <PixelPetIcon size={42} decorative />
      </button>
    </div>
  );
}
