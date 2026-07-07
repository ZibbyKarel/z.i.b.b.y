"use client";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Button, type ButtonIntent, type ButtonSize } from "../Button/Button";
import type { DropDownButtonItem } from "../DropDownButton/DropDownButton";
import { Icon } from "../Icon/Icon";
import { MenuSurface } from "../MenuSurface/MenuSurface";

export enum MenuButtonTestId {
  Root = "menu-button-root",
  Trigger = "menu-button-trigger",
  Menu = "menu-button-menu",
  Item = "menu-button-item",
}

/**
 * Reuses {@link DropDownButtonItem}'s shape (`{ id, label, icon?, disabled?,
 * onSelect }`) and adds an optional `danger` flag — a destructive row (Stop,
 * Delete) painted with the `bad` token instead of a separate item type.
 */
export interface MenuButtonItem extends DropDownButtonItem {
  /** Paints the row's icon + label with the `bad` token (a destructive action). */
  danger?: boolean;
}

export interface MenuButtonProps {
  /** The action rows shown in the menu. */
  items: MenuButtonItem[];
  intent?: ButtonIntent;
  size?: ButtonSize;
  /** Disables the trigger (and, transitively, the menu it would open). */
  disabled?: boolean;
  /** Accessible name for the kebab trigger. Defaults to "Actions". */
  ariaLabel?: string;
}

/**
 * An icon-only kebab (three-dot) trigger that opens a {@link MenuSurface} of
 * action rows — the pure "overflow menu" shape `DropDownButton` doesn't cover
 * (that one is a split button with a mandatory primary segment). Reuses
 * `DropDownButton`'s proven mechanics verbatim: fixed-position portal,
 * `updateRect` on scroll/resize, ArrowUp/Down + Enter/Escape/Tab keyboard nav
 * via `aria-activedescendant`, the `fixed inset-0` click-catcher, and the
 * menu-row markup with `focusRingInset`.
 */
export function MenuButton({
  items,
  intent = "ghost",
  size = "sm",
  disabled = false,
  ariaLabel = "Actions",
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  // Highlighted row for keyboard navigation (focus stays on the trigger; the
  // menu is driven via `aria-activedescendant`, mirroring DropDownButton).
  const [activeIndex, setActiveIndex] = useState(0);
  // The trigger's viewport rect, captured on open and kept fresh on scroll/resize,
  // so the portaled (fixed) menu can be positioned without an ancestor clipping it.
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const activeRow = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1);
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
      const item = items[i];
      if (!item || item.disabled) return;
      item.onSelect();
      close();
      triggerRef.current?.focus();
    },
    [items, close],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      if (items.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        const from = i < 0 ? 0 : Math.min(i, items.length - 1);
        return (from + delta + items.length) % items.length;
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
  // kebab. Flip above the trigger when there's more room there, and clamp the
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
    <div className="relative inline-flex" data-testid={MenuButtonTestId.Root}>
      <Button
        aria-activedescendant={open && activeRow >= 0 ? itemId(activeRow) : undefined}
        aria-controls={`${baseId}-menu`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        data-testid={MenuButtonTestId.Trigger}
        disabled={disabled}
        icon="dots"
        intent={intent}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        size={size}
      />

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <MenuSurface
              scroll
              align="end"
              data-testid={MenuButtonTestId.Menu}
              id={`${baseId}-menu`}
              placement="fixed"
              role="menu"
              style={menuStyle}
            >
              <div className="p-1">
                {items.map((item, i) => {
                  const active = i === activeRow;
                  const danger = item.danger && !item.disabled;
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
                      data-testid={`${MenuButtonTestId.Item}-${item.id}`}
                      id={itemId(i)}
                      key={item.id}
                      onClick={() => activate(i)}
                      onPointerMove={() => !item.disabled && setActiveIndex(i)}
                      role="menuitem"
                      type="button"
                    >
                      {item.icon && (
                        <Icon name={item.icon} size="sm" tone={danger ? "bad" : undefined} />
                      )}
                      <span
                        className={cn(
                          "text-md flex-1",
                          danger ? "text-bad" : "text-foreground",
                        )}
                      >
                        {item.label}
                      </span>
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
