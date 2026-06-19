import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { loadConfig } from "@/api/config";
import { ActionIcon } from "@/components/ActionIcon";
import { WindowPinButton } from "@/components/WindowPinButton";
import type { Action } from "@/types/actions";
import gsap from "gsap";
import { KeyboardIcon } from "@/icons/entryIcons";
import { executeAction } from "@/launcher/actionExecutor";
import { motionDuration, motionEase, motionStagger } from "@/motion/tokens";
import { useGsapContext } from "@/motion/useGsapContext";
import { useReducedMotion } from "@/motion/useReducedMotion";
import {
  getStoredEntryPosition,
  setStoredEntryPosition,
  type EntryWindowPosition,
} from "./windowPosition";
import {
  PET_BUTTON_SIZE,
  PET_CLOSED_WINDOW_SIZE,
  PET_MENU_BUTTON_SIZE,
  PET_MENU_CLOSE_DELAY_MS,
  PET_OPEN_WINDOW_SIZE,
  buildPetMenuItems,
  getCenteredResizeOffset,
  type PetMenuItem,
} from "./petLayout";
import {
  DEFAULT_PET_CODEX_STATUS,
  PET_CODEX_ENABLED_STORAGE_KEY,
  PET_CODEX_STATUS_EVENT,
  getPetCodexStatusColor,
  getPetCodexStatusLabel,
  normalizePetCodexStatusPayload,
  readPetCodexEnabled,
  type PetCodexStatus,
  type PetCodexStatusPayload,
} from "./petCodexStatus";

const KEYBOARD_RETURN_ANIMATION_KEY = "devlauncher:keyboard-return-animation";
const PET_RETURN_ANIMATION_KEY = "devlauncher:pet-return-animation";
const PET_ACTION_STATE_KEY = "devlauncher:pet-action-state";
const PET_SPRITE_ASSET_VERSION = "20260619-status-sprites-v2";
const PET_THINKING_STATUS_TIMEOUT_MS = 30_000;

type PetSpriteActionId = "cozy" | "keyboardJump" | "thinking" | "working" | "waiting" | "error" | "success";

type PetSpriteAction = {
  id: PetSpriteActionId;
  label: string;
  frameMs: number;
  frames: string[];
  loop: boolean;
};

function petFrames(folder: string) {
  return Array.from(
    { length: 8 },
    (_, index) => `/pet/siamese/${folder}/${String(index + 1).padStart(4, "0")}.png?v=${PET_SPRITE_ASSET_VERSION}`,
  );
}

const petActionRegistry: Record<PetSpriteActionId, PetSpriteAction> = {
  cozy: {
    id: "cozy",
    label: "悠闲待机",
    frameMs: 140,
    loop: true,
    frames: petFrames("cozy-tail-ear-wiggle"),
  },
  keyboardJump: {
    id: "keyboardJump",
    label: "键盘跳跃",
    frameMs: 90,
    loop: true,
    frames: petFrames("keyboard-jump"),
  },
  thinking: {
    id: "thinking",
    label: "思考中",
    frameMs: 150,
    loop: true,
    frames: petFrames("status-thinking"),
  },
  working: {
    id: "working",
    label: "执行中",
    frameMs: 115,
    loop: true,
    frames: petFrames("status-working"),
  },
  waiting: {
    id: "waiting",
    label: "等待确认",
    frameMs: 160,
    loop: true,
    frames: petFrames("status-waiting"),
  },
  error: {
    id: "error",
    label: "失败",
    frameMs: 135,
    loop: true,
    frames: petFrames("status-error"),
  },
  success: {
    id: "success",
    label: "已完成",
    frameMs: 145,
    loop: true,
    frames: petFrames("status-success"),
  },
};

function getPetSpriteActionForCodexStatus(status: PetCodexStatus): PetSpriteActionId {
  if (status === "thinking") return "thinking";
  if (status === "working") return "working";
  if (status === "waiting") return "waiting";
  if (status === "error") return "error";
  if (status === "success") return "success";
  return "cozy";
}

const shellStyle: CSSProperties = {
  position: "relative",
  width: "100vw",
  height: "100vh",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  color: "rgba(255,255,255,0.92)",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  overflow: "visible",
  pointerEvents: "none",
};

const centerButtonStyle: CSSProperties = {
  position: "relative",
  zIndex: 3,
  width: PET_BUTTON_SIZE.width,
  height: PET_BUTTON_SIZE.height,
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
  pointerEvents: "auto",
};

const bubbleMenuStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  zIndex: 5,
  width: PET_OPEN_WINDOW_SIZE.width,
  height: PET_OPEN_WINDOW_SIZE.height,
  opacity: 0,
  transform: "scale(0.94)",
  transformOrigin: "center",
  pointerEvents: "none",
  overflow: "visible",
};

const actionButtonStyle: CSSProperties = {
  position: "absolute",
  zIndex: 6,
  width: PET_MENU_BUTTON_SIZE.width,
  height: PET_MENU_BUTTON_SIZE.height,
  borderRadius: 6,
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
  pointerEvents: "auto",
};

const codexBadgeStyle: CSSProperties = {
  position: "absolute",
  right: 2,
  bottom: 0,
  zIndex: 8,
  minWidth: 46,
  maxWidth: 86,
  height: 20,
  padding: "0 7px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.32)",
  background: "rgba(15,23,42,0.92)",
  color: "rgba(255,255,255,0.9)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: "nowrap",
  pointerEvents: "none",
  boxShadow: "0 2px 0 rgba(0,0,0,0.28)",
};

const codexMessageStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: 18,
  zIndex: 7,
  minWidth: 112,
  maxWidth: 158,
  padding: "4px 7px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(15,23,42,0.94)",
  color: "rgba(255,255,255,0.82)",
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1.35,
  textAlign: "center",
  overflowWrap: "anywhere",
  transform: "translateX(-50%)",
  pointerEvents: "auto",
  cursor: "pointer",
  boxShadow: "0 6px 16px rgba(0,0,0,0.26)",
};

function getPetMenuItemKey(item: PetMenuItem): string {
  return item.kind === "keyboard" ? "keyboard" : `custom-${item.slotIndex}`;
}

function PetMenuItemIcon({ item }: { item: PetMenuItem }) {
  if (item.kind === "keyboard") return <KeyboardIcon size={18} decorative />;
  return <ActionIcon action={item.action} size={18} />;
}

function PixelSiamesePet({
  actionId,
  frameSrc,
  actionLabel,
}: {
  actionId: PetSpriteActionId;
  frameSrc: string;
  actionLabel: string;
}) {
  return (
    <span className="pet-siamese-frame" data-pet-sprite-action={actionId} aria-hidden="true">
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

async function setPetWindowSize(open: boolean) {
  const size = open ? PET_OPEN_WINDOW_SIZE : PET_CLOSED_WINDOW_SIZE;
  await getCurrentWindow().setSize(new LogicalSize(size.width, size.height));
}

async function setPetWindowLayout(open: boolean) {
  const win = getCurrentWindow();
  const position = await win.outerPosition();
  const fromSize = open ? PET_CLOSED_WINDOW_SIZE : PET_OPEN_WINDOW_SIZE;
  const toSize = open ? PET_OPEN_WINDOW_SIZE : PET_CLOSED_WINDOW_SIZE;
  const offset = getCenteredResizeOffset(fromSize, toSize);

  await win.setSize(new LogicalSize(toSize.width, toSize.height));
  await win.setPosition(new PhysicalPosition(position.x + offset.x, position.y + offset.y));
}

export function PetEntryApp() {
  const [open, setOpen] = useState(false);
  const [modeTransition, setModeTransition] = useState<"idle" | "to-keyboard">("idle");
  const [spriteActionId, setSpriteActionId] = useState<PetSpriteActionId>("cozy");
  const [spriteFrameIndex, setSpriteFrameIndex] = useState(0);
  const [codexEnabled, setCodexEnabled] = useState(readPetCodexEnabled);
  const [codexStatus, setCodexStatus] = useState<PetCodexStatusPayload>(DEFAULT_PET_CODEX_STATUS);
  const [dismissedCodexMessageKey, setDismissedCodexMessageKey] = useState<string | null>(null);
  const [customMenuActions, setCustomMenuActions] = useState<Array<Action | null>>([]);
  const shellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const centerButtonRef = useRef<HTMLButtonElement>(null);
  const codexEnabledRef = useRef(codexEnabled);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const closeLayoutTimerRef = useRef<number | null>(null);
  const spriteTimerRef = useRef<number | null>(null);
  const thinkingStatusTimerRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const spriteAction = petActionRegistry[spriteActionId];
  const spriteFrameSrc = spriteAction.frames[spriteFrameIndex] ?? spriteAction.frames[0];
  const codexStatusColor = getPetCodexStatusColor(codexStatus.status);
  const codexMessageKey = codexStatus.message ? `${codexStatus.status}:${codexStatus.message}` : "";
  const codexMessageVisible = Boolean(codexStatus.message && codexMessageKey !== dismissedCodexMessageKey);
  const menuItems = useMemo(() => buildPetMenuItems(customMenuActions), [customMenuActions]);

  const clearThinkingStatusTimer = useCallback(() => {
    if (thinkingStatusTimerRef.current === null) return;
    window.clearTimeout(thinkingStatusTimerRef.current);
    thinkingStatusTimerRef.current = null;
  }, []);

  const applyCodexStatus = useCallback((payload: unknown) => {
    const nextStatus = normalizePetCodexStatusPayload(payload);
    clearThinkingStatusTimer();
    setCodexStatus(nextStatus);

    if (nextStatus.status !== "thinking") return;
    thinkingStatusTimerRef.current = window.setTimeout(() => {
      thinkingStatusTimerRef.current = null;
      setCodexStatus(DEFAULT_PET_CODEX_STATUS);
    }, PET_THINKING_STATUS_TIMEOUT_MS);
  }, [clearThinkingStatusTimer]);

  useEffect(() => {
    codexEnabledRef.current = codexEnabled;
    if (!codexEnabled) {
      clearThinkingStatusTimer();
      setCodexStatus(DEFAULT_PET_CODEX_STATUS);
      return;
    }
    setCodexStatus((current) => current.status === "idle" ? { status: "disconnected" } : current);
  }, [clearThinkingStatusTimer, codexEnabled]);

  useEffect(() => {
    if (!codexStatus.message) {
      setDismissedCodexMessageKey(null);
    }
  }, [codexStatus.message]);


  useEffect(() => {
    if (!codexEnabled) {
      playDefaultSpriteAction();
      return;
    }
    playSpriteAction(getPetSpriteActionForCodexStatus(codexStatus.status));
  }, [codexEnabled, codexStatus.status, reducedMotion]);

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

    if (reducedMotion || action.frames.length <= 1) return;

    let nextFrame = 1;
    const tick = () => {
      if (nextFrame >= action.frames.length) {
        if (!action.loop) {
          spriteTimerRef.current = null;
          return;
        }
        nextFrame = 0;
      }

      setSpriteFrameIndex(nextFrame);
      nextFrame += 1;
      spriteTimerRef.current = window.setTimeout(tick, action.frameMs);
    };

    spriteTimerRef.current = window.setTimeout(tick, action.frameMs);
  };

  const playDefaultSpriteAction = () => {
    const action = petActionRegistry.cozy;
    stopSpriteTimer();
    setSpriteActionId("cozy");
    setSpriteFrameIndex(0);

    if (reducedMotion) return;

    let nextFrame = 1;
    const tick = () => {
      if (nextFrame >= action.frames.length) {
        nextFrame = 0;
      }

      setSpriteFrameIndex(nextFrame);
      nextFrame += 1;
      spriteTimerRef.current = window.setTimeout(tick, action.frameMs);
    };

    spriteTimerRef.current = window.setTimeout(tick, action.frameMs);
  };

  const syncPetSpriteActionFromStorage = () => {
    const nextAction = window.localStorage.getItem(PET_ACTION_STATE_KEY);
    if (nextAction === "keyboardJump" || nextAction === "cozy") {
      playSpriteAction(nextAction);
      return;
    }
    playDefaultSpriteAction();
  };

  const clearCloseLayoutTimer = () => {
    if (closeLayoutTimerRef.current === null) return;
    window.clearTimeout(closeLayoutTimerRef.current);
    closeLayoutTimerRef.current = null;
  };

  const openPetMenu = () => {
    clearCloseLayoutTimer();
    setOpen(true);
    setPetWindowLayout(true).catch(console.error);
  };

  const closePetMenu = () => {
    clearCloseLayoutTimer();
    setOpen(false);
    closeLayoutTimerRef.current = window.setTimeout(() => {
      setPetWindowLayout(false).catch(console.error);
      closeLayoutTimerRef.current = null;
    }, reducedMotion ? 0 : PET_MENU_CLOSE_DELAY_MS);
  };

  useEffect(() => {
    window.localStorage.setItem(PET_ACTION_STATE_KEY, "cozy");
    playDefaultSpriteAction();
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PET_ACTION_STATE_KEY) return;
      syncPetSpriteActionFromStorage();
    };
    let unlistenPetAction: (() => void) | null = null;
    listen<string>("pet-action-state", (event) => {
      if (event.payload === "keyboardJump" || event.payload === "cozy") {
        window.localStorage.setItem(PET_ACTION_STATE_KEY, event.payload);
        playSpriteAction(event.payload);
      }
    })
      .then((unlisten) => {
        unlistenPetAction = unlisten;
      })
      .catch(console.error);

    window.addEventListener("storage", handleStorage);
    return () => {
      if (unlistenPetAction) unlistenPetAction();
      window.removeEventListener("storage", handleStorage);
      stopSpriteTimer();
      clearCloseLayoutTimer();
    };
  }, [reducedMotion]);

  useEffect(() => {
    let unlistenCodexStatus: (() => void) | null = null;
    let unlistenPetMenu: (() => void) | null = null;

    loadConfig()
      .then((config) => {
        const enabled = Boolean(config.pet?.codex?.enabled);
        window.localStorage.setItem(PET_CODEX_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
        setCodexEnabled(enabled);
        setCustomMenuActions(config.pet?.menu.customActions ?? []);
      })
      .catch(() => {
        setCodexEnabled(false);
        setCustomMenuActions([]);
      });

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PET_CODEX_ENABLED_STORAGE_KEY) return;
      setCodexEnabled(readPetCodexEnabled());
    };

    listen<unknown>(PET_CODEX_STATUS_EVENT, (event) => {
      if (!codexEnabledRef.current) return;
      applyCodexStatus(event.payload);
    })
      .then((unlisten) => {
        unlistenCodexStatus = unlisten;
      })
      .catch(console.error);

    listen<Array<Action | null>>("pet-menu-config-changed", (event) => {
      setCustomMenuActions(event.payload);
    })
      .then((unlisten) => {
        unlistenPetMenu = unlisten;
      })
      .catch(console.error);

    window.addEventListener("storage", handleStorage);
    return () => {
      if (unlistenCodexStatus) unlistenCodexStatus();
      if (unlistenPetMenu) unlistenPetMenu();
      window.removeEventListener("storage", handleStorage);
      clearThinkingStatusTimer();
    };
  }, [applyCodexStatus, clearThinkingStatusTimer]);

  useEffect(() => {
    if (!codexEnabled) return;

    let stopped = false;
    const pollMcpEvents = () => {
      invoke<PetCodexStatusPayload[]>("take_pet_mcp_events")
        .then((events) => {
          if (stopped || events.length === 0) return;
          const next = events[events.length - 1];
          applyCodexStatus(next);
        })
        .catch(() => {});
    };

    pollMcpEvents();
    const timer = window.setInterval(pollMcpEvents, 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [applyCodexStatus, codexEnabled]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const currentWindow = getCurrentWindow();

    setPetWindowSize(false).catch(console.error);
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
      .map((item) => menu.querySelector<HTMLButtonElement>(`[data-pet-action="${getPetMenuItemKey(item)}"]`))
      .filter((button): button is HTMLButtonElement => Boolean(button));

    const tl = gsap.timeline({ defaults: { overwrite: "auto" } });
    if (open) {
      tl.to(menu, {
        opacity: 1,
        visibility: "visible",
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
          opacity: 1,
          visibility: "visible",
          scale: 1,
          xPercent: -50,
          yPercent: -50,
          duration: reducedMotion ? 0 : motionDuration.playful,
          ease: reducedMotion ? motionEase.standard : motionEase.playful,
          stagger: reducedMotion ? 0 : motionStagger.tight,
        }, reducedMotion ? 0 : 0.03);
    } else {
      tl.to(actionButtons, {
        opacity: 0,
        visibility: "hidden",
        scale: 0.72,
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
          opacity: 0,
          visibility: "hidden",
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
  }, [menuItems, open, reducedMotion]);

  async function switchToKeyboard() {
    if (modeTransition !== "idle") return;
    setModeTransition("to-keyboard");
    await savePetPosition();
    const duration = reducedMotion ? 0 : motionDuration.playful;
    const durationMs = Math.round(duration * 1000);
    const shell = shellRef.current;
    const menu = menuRef.current;
    const centerButton = centerButtonRef.current;
    const actionButtons = menu
      ? menuItems
          .map((item) => menu.querySelector<HTMLButtonElement>(`[data-pet-action="${getPetMenuItemKey(item)}"]`))
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
        opacity: 0,
        visibility: "hidden",
        scale: reducedMotion ? 1 : 0.82,
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
        opacity: 0,
        visibility: "hidden",
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
      gsap.set(menu, { scaleX: 1, scaleY: 1, scale: 0.94, y: 8, opacity: 0, visibility: "hidden" });
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

  async function runMenuItem(item: PetMenuItem) {
    closePetMenu();
    if (item.kind === "keyboard") {
      await switchToKeyboard();
      return;
    }

    await executeAction(item.action, { invoke });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStartRef.current;
    if (!start) return;
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
    if (open) {
      closePetMenu();
      return;
    }
    openPetMenu();
  }

  function dismissCodexMessage() {
    if (!codexMessageKey) return;
    setDismissedCodexMessageKey(codexMessageKey);
  }

  return (
    <div ref={shellRef} className="pet-shell" style={shellStyle}>
      <div
        ref={menuRef}
        className={`pet-bubble-menu ${open ? "is-open" : ""} ${modeTransition === "to-keyboard" ? "is-switching" : ""}`}
        style={{
          ...bubbleMenuStyle,
          opacity: open ? 1 : 0,
          visibility: open ? "visible" : "hidden",
          transform: open ? "scale(1)" : bubbleMenuStyle.transform,
          pointerEvents: "none",
        }}
      >
        {menuItems.map((item) => (
          <button
            key={getPetMenuItemKey(item)}
            className="pet-action-button"
            onClick={() => runMenuItem(item).catch(console.error)}
            style={{
              ...actionButtonStyle,
              left: item.left,
              top: item.top,
              opacity: open ? 1 : 0,
              visibility: open ? "visible" : "hidden",
              transform: open ? "translate(-50%, -50%) scale(1)" : actionButtonStyle.transform,
            }}
            data-pet-action={getPetMenuItemKey(item)}
            aria-label={item.label}
            title={item.title}
            type="button"
          >
            <PetMenuItemIcon item={item} />
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
          cursor: "grab",
          filter: open ? "drop-shadow(0 5px 0 rgba(0,0,0,0.18))" : "none",
        }}
        title={open ? "收起菜单" : "展开快捷入口"}
        type="button"
      >
        <PixelSiamesePet actionId={spriteAction.id} frameSrc={spriteFrameSrc} actionLabel={spriteAction.label} />
        {codexEnabled && (
          <>
            {codexMessageVisible && (
              <span
                role="button"
                tabIndex={0}
                aria-label="关闭宠物提示"
                title="点击标记为已读"
                style={codexMessageStyle}
                onClick={(event) => {
                  event.stopPropagation();
                  dismissCodexMessage();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  dismissCodexMessage();
                }}
              >
                {codexStatus.message}
              </span>
            )}
            <span style={codexBadgeStyle} title={`Codex ${getPetCodexStatusLabel(codexStatus.status)}`}>
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: codexStatusColor,
                  boxShadow: `0 0 8px ${codexStatusColor}`,
                  flexShrink: 0,
                }}
              />
              {getPetCodexStatusLabel(codexStatus.status)}
            </span>
          </>
        )}
      </button>
      <WindowPinButton
        style={{
          position: "absolute",
          left: 2,
          bottom: 0,
          zIndex: 8,
          width: 22,
          height: 20,
          pointerEvents: "auto",
        }}
      />
    </div>
  );
}
