import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import gsap from "gsap";
import { ClipIcon, KeyboardIcon, ReportIcon, SearchIcon } from "@/icons/entryIcons";
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
const PET_ACTION_UPLOAD_SLOT = "devlauncher:pet-custom-action-upload";

type PetSpriteActionId = "keyboardJump";

type PetSpriteAction = {
  id: PetSpriteActionId;
  label: string;
  frameMs: number;
  frames: string[];
};

const petActionRegistry: Record<PetSpriteActionId, PetSpriteAction> = {
  keyboardJump: {
    id: "keyboardJump",
    label: "键盘跳跃",
    frameMs: 90,
    frames: Array.from(
      { length: 8 },
      (_, index) => `/pet/siamese/keyboard-jump/${String(index + 1).padStart(4, "0")}.png`,
    ),
  },
};

const customActionUploadEntry = {
  storageKey: PET_ACTION_UPLOAD_SLOT,
  accepts: ["image/png", "image/webp"],
  frameSource: "future-upload",
} as const;

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
  width: 148,
  height: 132,
  border: 0,
  background: "transparent",
  boxShadow: "none",
  cursor: "grab",
  display: "grid",
  placeItems: "center",
  padding: 0,
  userSelect: "none",
  transition: "filter 180ms ease",
  touchAction: "none",
};

const bubbleMenuStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: 2,
  width: 194,
  height: 42,
  borderRadius: 6,
  background: "rgba(12, 18, 28, 0.96)",
  border: "2px solid rgba(248, 250, 252, 0.72)",
  boxShadow: "0 4px 0 rgba(0,0,0,0.32), inset 0 -2px 0 rgba(15,23,42,0.72)",
  opacity: 0,
  transform: "translateX(-50%) translateY(6px) scale(0.94)",
  pointerEvents: "none",
  overflow: "visible",
};

const actionButtonStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 32,
  height: 32,
  borderRadius: 5,
  border: "2px solid rgba(226,232,240,0.68)",
  background: "rgba(30, 41, 59, 0.98)",
  color: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
  padding: 0,
  outline: "none",
  display: "grid",
  placeItems: "center",
  boxShadow: "0 3px 0 rgba(0,0,0,0.35)",
  transform: "translate(-50%, -50%) scale(0.72)",
  opacity: 0,
  transition: "background 120ms ease, box-shadow 160ms ease, filter 160ms ease",
};

const menuItems = [
  { label: "搜索", title: "打开搜索", x: -72, y: 0, action: "search" },
  { label: "报告", title: "打开截图报告", x: -36, y: 0, action: "report" },
  { label: "剪贴", title: "打开剪贴板", x: 0, y: 0, action: "clip" },
  { label: "键盘", title: "切换到键盘模式", x: 36, y: 0, action: "keyboard" },
  { label: "动作", title: "自定义动作图片入口", x: 72, y: 0, action: "custom-action" },
] as const;

type PetAction = (typeof menuItems)[number]["action"];

function PetActionIcon({ action }: { action: PetAction }) {
  const iconProps = { size: 20, decorative: true };
  if (action === "search") return <SearchIcon {...iconProps} />;
  if (action === "report") return <ReportIcon {...iconProps} />;
  if (action === "clip") return <ClipIcon {...iconProps} />;
  if (action === "keyboard") return <KeyboardIcon {...iconProps} />;
  return <span className="pet-action-plus" aria-hidden="true">+</span>;
}

function PixelSiamesePet({ frameSrc, actionLabel }: { frameSrc: string; actionLabel: string }) {
  return (
    <span className="pet-siamese-frame" aria-hidden="true">
      <img src={frameSrc} alt="" draggable={false} data-action-label={actionLabel} />
    </span>
  );
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
  const [spriteActionId, setSpriteActionId] = useState<PetSpriteActionId>("keyboardJump");
  const [spriteFrameIndex, setSpriteFrameIndex] = useState(0);
  const [customHintVisible, setCustomHintVisible] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const centerButtonRef = useRef<HTMLButtonElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const spriteTimerRef = useRef<number | null>(null);
  const customHintTimerRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const spriteAction = petActionRegistry[spriteActionId];
  const spriteFrameSrc = spriteAction.frames[spriteFrameIndex] ?? spriteAction.frames[0];

  const resetPetVisualState = () => {
    const shell = shellRef.current;
    const menu = menuRef.current;
    const centerButton = centerButtonRef.current;

    gsap.killTweensOf([shell, menu, centerButton]);
    gsap.set(shell, { autoAlpha: 1, scale: 1, filter: "none", clearProps: "transform" });
    gsap.set(menu, { scaleX: 1, scaleY: 1 });
    gsap.set(centerButton, { autoAlpha: 1, scale: 1, rotation: 0, filter: "none" });
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
        scale: 1,
        rotation: 0,
        filter: "none",
        duration: motionDuration.playful,
        ease: motionEase.enter,
      }, 0.04);
  };

  const stopSpriteTimer = () => {
    if (spriteTimerRef.current === null) return;
    window.clearTimeout(spriteTimerRef.current);
    spriteTimerRef.current = null;
  };

  const playSpriteAction = (actionId: PetSpriteActionId) => {
    const action = petActionRegistry[actionId];
    stopSpriteTimer();
    setSpriteActionId(actionId);
    setSpriteFrameIndex(0);

    if (reducedMotion) return;

    let nextFrame = 1;
    const tick = () => {
      if (nextFrame >= action.frames.length) {
        spriteTimerRef.current = window.setTimeout(() => {
          setSpriteFrameIndex(0);
          spriteTimerRef.current = null;
        }, action.frameMs);
        return;
      }

      setSpriteFrameIndex(nextFrame);
      nextFrame += 1;
      spriteTimerRef.current = window.setTimeout(tick, action.frameMs);
    };

    spriteTimerRef.current = window.setTimeout(tick, action.frameMs);
  };

  const showCustomActionHint = () => {
    window.localStorage.setItem(customActionUploadEntry.storageKey, JSON.stringify(customActionUploadEntry));
    setCustomHintVisible(true);
    if (customHintTimerRef.current !== null) window.clearTimeout(customHintTimerRef.current);
    customHintTimerRef.current = window.setTimeout(() => {
      setCustomHintVisible(false);
      customHintTimerRef.current = null;
    }, 1800);
  };

  useEffect(() => {
    return () => {
      stopSpriteTimer();
      if (customHintTimerRef.current !== null) window.clearTimeout(customHintTimerRef.current);
    };
  }, []);

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

  useGsapContext(menuRef, () => {
    const menu = menuRef.current;
    const centerButton = centerButtonRef.current;
    if (!menu || !centerButton) return;

    const actionButtons = menuItems
      .map((item) => menu.querySelector<HTMLButtonElement>(`[data-pet-action="${item.action}"]`))
      .filter((button): button is HTMLButtonElement => Boolean(button));

    const tl = gsap.timeline({ defaults: { overwrite: "auto" } });
    if (open) {
      tl.to(menu, {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        duration: reducedMotion ? 0 : motionDuration.quick,
        ease: reducedMotion ? motionEase.standard : motionEase.enter,
      }, 0)
        .to(centerButton, {
          scale: 1,
          rotation: 0,
          duration: 0,
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
        scale: 0.72,
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
        .to(menu, {
          autoAlpha: 0,
          scale: 0.94,
          y: 8,
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
    playSpriteAction("keyboardJump");
    setModeTransition("to-keyboard");
    await savePetPosition();
    const duration = reducedMotion ? 0 : motionDuration.playful;
    const durationMs = Math.round(duration * 1000);
    const shell = shellRef.current;
    const menu = menuRef.current;
    const centerButton = centerButtonRef.current;
    const actionButtons = menu
      ? menuItems
          .map((item) => menu.querySelector<HTMLButtonElement>(`[data-pet-action="${item.action}"]`))
          .filter((button): button is HTMLButtonElement => Boolean(button))
      : [];
    const tl = gsap.timeline({ defaults: { overwrite: "auto" } });

    tl.to(shell, {
      autoAlpha: 1,
      scale: 1,
      filter: reducedMotion ? "none" : "brightness(1.08) saturate(1.08)",
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
      .to(menu, {
        autoAlpha: 0,
        scale: reducedMotion ? 0.94 : 0.98,
        y: reducedMotion ? 8 : 14,
        duration,
        ease: motionEase.exit,
      }, 0)
      .to(centerButton, {
        autoAlpha: 1,
        scale: reducedMotion ? 1 : 0.96,
        rotation: 0,
        filter: reducedMotion ? "none" : "brightness(1.12) saturate(1.12)",
        duration,
        ease: motionEase.morph,
      }, 0);

    window.setTimeout(() => {
      gsap.set(shell, { autoAlpha: 1, scale: 1, filter: "none", clearProps: "transform" });
      gsap.set(menu, { scaleX: 1, scaleY: 1, scale: 0.94, y: 8, autoAlpha: 0 });
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
    if (action === "custom-action") showCustomActionHint();
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
    playSpriteAction("keyboardJump");
    setOpen((value) => !value);
  }

  return (
    <div ref={shellRef} className="pet-shell" style={shellStyle}>
      <div
        ref={menuRef}
        className={`pet-bubble-menu ${open ? "is-open" : ""} ${modeTransition === "to-keyboard" ? "is-switching" : ""}`}
        style={{
          ...bubbleMenuStyle,
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
          filter: open ? "drop-shadow(0 5px 0 rgba(0,0,0,0.18))" : "none",
        }}
        title={open ? "收起菜单" : "展开快捷入口"}
        type="button"
      >
        <PixelSiamesePet frameSrc={spriteFrameSrc} actionLabel={spriteAction.label} />
      </button>
      <div className={`pet-custom-action-hint ${customHintVisible ? "is-visible" : ""}`} role="status">
        已预留上传动作图片入口
      </div>
    </div>
  );
}
