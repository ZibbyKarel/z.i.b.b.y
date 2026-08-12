"use client";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Button, type ButtonIntent, type ButtonSize } from "../Button/Button";
import { Divider } from "../Divider/Divider";
import { Icon, type IconName } from "../Icon/Icon";
import { MenuSurface } from "../MenuSurface/MenuSurface";

export enum DropDownButtonTestId {
  Root = "drop-down-button-root",
  Primary = "drop-down-button-primary",
  Trigger = "drop-down-button-trigger",
  Menu = "drop-down-button-menu",
  Item = "drop-down-button-item",
}

export interface DropDownButtonItem {
  id: string;
  label: string;
  icon?: IconName;
  disabled?: boolean;
  onSelect: () => void;
}

export interface DropDownButtonProps {
  /** Primary action label. */
  label: string;
  /** Fires when the primary segment is activated. */
  onClick: () => void;
  /** Optional leading icon on the primary segment. */
  icon?: IconName;
  intent?: ButtonIntent;
  size?: ButtonSize;
  /** Replaces the primary segment's icon with a spinner and suppresses its click. */
  loading?: boolean;
  /** Disables both segments and the menu. */
  disabled?: boolean;
  /** Secondary actions shown in the chevron's menu. */
  menuItems: DropDownButtonItem[];
  /** Accessible name for the chevron trigger. Defaults to "More actions". */
  menuAriaLabel?: string;
}

/**
 * A split button — a primary action (label + optional icon) with a trailing
 * chevron that opens a menu of secondary actions. Built from {@link Button}
 * (both segments) and {@link MenuSurface} (the portaled menu), mirroring the
 * fixed-position/keyboard pattern {@link Dropdown} already established.
 */
export function DropDownButton({
  label,
  onClick,
  icon,
  intent = "primary",
  size = "md",
  loading = false,
  disabled = false,
  menuItems,
  menuAriaLabel = "More actions",
}: DropDownButtonProps) {
  const [open, setOpen] = useState(false);
  // Highlighted row for keyboard navigation (focus stays on the chevron trigger;
  // the menu is driven via `aria-activedescendant`, mirroring Dropdown).
  const [activeIndex, setActiveIndex] = useState(0);
  // The trigger's viewport rect, captured on open and kept fresh on scroll/resize,
  // so the portaled (fixed) menu can be positioned without an ancestor clipping it.
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const activeRow = menuItems.length === 0 ? -1 : Math.min(activeIndex, menuItems.length - 1);
  const itemId = (i: number) => `${baseId}-item-${i}`;

  const close = useCallback(() => setOpen(false), []);

  const updateRect = useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  const openMenu = useCallback(() => {
    updateRect();
    setActiveIndex(0);
    setOpen(true);
  }, [updateRect]);

  // Reposition while open: the menu is `fixed`, so scroll/resize would otherwise
  // detach it from the trigger.
  useEffect(() => {
    if (!open) return;
    updateRect();
    const onScroll = () => updateRect();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, updateRect]);

  const activate = useCallback(
    (i: number) => {
      const item = menuItems[i];
      if (!item || item.disabled) return;
      item.onSelect();
      close();
      triggerRef.current?.focus();
    },
    [menuItems, close],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      if (menuItems.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        const from = i < 0 ? 0 : Math.min(i, menuItems.length - 1);
        return (from + delta + menuItems.length) % menuItems.length;
      });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) openMenu();
      else if (activeRow >= 0) activate(activeRow);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
    } else if (e.key === "Tab" && open) {
      // Let focus leave naturally, but don't strand an open menu behind it.
      close();
    }
  };

  // Position the fixed surface from the trigger rect, right-aligned under the
  // chevron. Flip above the trigger when there's more room there, and clamp the
  // height so the last rows never fall off-screen.
  const menuStyle: CSSProperties | undefined = (() => {
    if (!rect) return undefined;
    const gap = 6;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 0;
    const spaceBelow = viewportH - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const flip = spaceBelow < 160 && spaceAbove > spaceBelow;
    const available = Math.max(flip ? spaceAbove : spaceBelow, 0);
    const maxHeight = Math.min(Math.max(available, 120), viewportH * 0.6);
    const horizontal: CSSProperties = {
      left: Math.max(0, rect.right - 200),
      minWidth: Math.max(200, rect.width),
    };
    return flip
      ? { bottom: viewportH - rect.top + gap, ...horizontal, maxHeight }
      : { top: rect.bottom + gap, ...horizontal, maxHeight };
  })();

  return (
    <div className="relative inline-flex" data-testid={DropDownButtonTestId.Root}>
      <div className="inline-flex items-stretch">
        <Button
          data-testid={DropDownButtonTestId.Primary}
          disabled={disabled}
          icon={icon}
          intent={intent}
          loading={loading}
          onClick={onClick}
          size={size}
          style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
        >
          {label}
        </Button>
        <Divider orientation="vertical" />
        <Button
          aria-activedescendant={open && activeRow >= 0 ? itemId(activeRow) : undefined}
          aria-controls={`${baseId}-menu`}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={menuAriaLabel}
          data-testid={DropDownButtonTestId.Trigger}
          disabled={disabled}
          intent={intent}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={handleKeyDown}
          ref={triggerRef}
          size={size}
          style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
        >
          <span
            className={cn("inline-flex transition-transform duration-150", open && "rotate-90")}
          >
            <Icon name="chevron" size={size === "sm" ? "xs" : "sm"} />
          </span>
        </Button>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <MenuSurface
              scroll
              align="end"
              data-testid={DropDownButtonTestId.Menu}
              id={`${baseId}-menu`}
              placement="fixed"
              role="menu"
              style={menuStyle}
            >
              <div className="p-1">
                {menuItems.map((item, i) => {
                  const active = i === activeRow;
                  return (
                    <button
                      aria-disabled={item.disabled || undefined}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-[11px] py-[9px]",
                        "rounded-sm cursor-pointer border-none text-left",
                        focusRingInset,
                        "transition-colors duration-100",
                        item.disabled
                          ? "cursor-not-allowed opacity-50"
                          : cn(active ? "bg-surface" : "bg-transparent hover:bg-surface"),
                        active && !item.disabled && "ring-1 ring-inset ring-border-strong",
                      )}
                      data-testid={`${DropDownButtonTestId.Item}-${item.id}`}
                      id={itemId(i)}
                      key={item.id}
                      onClick={() => activate(i)}
                      onPointerMove={() => !item.disabled && setActiveIndex(i)}
                      role="menuitem"
                      type="button"
                    >
                      {item.icon && <Icon name={item.icon} size="sm" />}
                      <span className="text-md text-foreground flex-1">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </MenuSurface>
          </>,
          document.body,
        )}
    </div>
  );
}
