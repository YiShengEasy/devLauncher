import { forwardRef, type CSSProperties } from "react";
import { ActionIcon } from "@/components/ActionIcon";
import { KeyboardIcon } from "@/icons/entryIcons";
import {
  PET_MENU_BUTTON_SIZE,
  PET_MENU_CENTER,
  PET_MENU_INNER_RADIUS,
  PET_MENU_OUTER_RADIUS,
  PET_OPEN_WINDOW_SIZE,
  getPetMenuItemKey,
  type PetMenuItem,
} from "./petLayout";

type PetRadialMenuProps = {
  items: PetMenuItem[];
  open: boolean;
  activeItemKey: string | null;
  className?: string;
  style?: CSSProperties;
  onActiveItemChange: (itemKey: string | null) => void;
  onActivateItem: (item: PetMenuItem) => void;
};

function polarPoint(radius: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return {
    x: PET_MENU_CENTER.x + Math.cos(radians) * radius,
    y: PET_MENU_CENTER.y + Math.sin(radians) * radius,
  };
}

function buildSectorPath(angle: number) {
  const halfSpan = 42;
  const outerStart = polarPoint(PET_MENU_OUTER_RADIUS, angle - halfSpan);
  const outerEnd = polarPoint(PET_MENU_OUTER_RADIUS, angle + halfSpan);
  const innerEnd = polarPoint(PET_MENU_INNER_RADIUS, angle + halfSpan);
  const innerStart = polarPoint(PET_MENU_INNER_RADIUS, angle - halfSpan);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${PET_MENU_OUTER_RADIUS} ${PET_MENU_OUTER_RADIUS} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${PET_MENU_INNER_RADIUS} ${PET_MENU_INNER_RADIUS} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function PetMenuItemIcon({ item }: { item: PetMenuItem }) {
  if (item.kind === "keyboard") return <KeyboardIcon size={18} decorative />;
  return <ActionIcon action={item.action} size={18} />;
}

export const PetRadialMenu = forwardRef<HTMLDivElement, PetRadialMenuProps>(
  function PetRadialMenu(
    {
      items,
      open,
      activeItemKey,
      className = "",
      style,
      onActiveItemChange,
      onActivateItem,
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={`pet-radial-menu ${className}`.trim()}
        style={{
          width: PET_OPEN_WINDOW_SIZE.width,
          height: PET_OPEN_WINDOW_SIZE.height,
          ...style,
        }}
        aria-hidden={!open}
      >
        <svg
          className="pet-radial-menu__sectors"
          viewBox={`0 0 ${PET_OPEN_WINDOW_SIZE.width} ${PET_OPEN_WINDOW_SIZE.height}`}
          aria-hidden="true"
        >
          {items.map((item) => {
            const itemKey = getPetMenuItemKey(item);
            const active = itemKey === activeItemKey;
            return (
              <path
                key={itemKey}
                className={`pet-radial-menu__sector ${active ? "is-active" : ""}`}
                d={buildSectorPath(item.angle)}
                data-pet-sector={item.sector}
                onPointerEnter={() => onActiveItemChange(itemKey)}
                onPointerLeave={() => {
                  if (active) onActiveItemChange(null);
                }}
                onClick={() => onActivateItem(item)}
              />
            );
          })}
        </svg>

        {items.map((item) => {
          const itemKey = getPetMenuItemKey(item);
          const active = itemKey === activeItemKey;
          return (
            <button
              key={itemKey}
              className={`pet-action-button pet-radial-menu__item ${active ? "is-active" : ""}`}
              type="button"
              title={item.title}
              aria-label={item.label}
              data-pet-action={itemKey}
              data-pet-sector={item.sector}
              onPointerEnter={() => onActiveItemChange(itemKey)}
              onPointerLeave={() => {
                if (active) onActiveItemChange(null);
              }}
              onFocus={() => onActiveItemChange(itemKey)}
              onBlur={() => onActiveItemChange(null)}
              onClick={() => onActivateItem(item)}
              style={{
                left: item.left,
                top: item.top,
                width: PET_MENU_BUTTON_SIZE.width,
                height: PET_MENU_BUTTON_SIZE.height,
                opacity: open ? 1 : 0,
                visibility: open ? "visible" : "hidden",
                transform: open
                  ? "translate(-50%, -50%) scale(1)"
                  : "translate(-50%, -50%) scale(0.78)",
              }}
            >
              <span className="pet-radial-menu__icon">
                <PetMenuItemIcon item={item} />
              </span>
              <span className="pet-radial-menu__label">{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  },
);
