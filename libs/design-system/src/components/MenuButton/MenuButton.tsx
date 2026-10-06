"use client";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";
import { focusRing, focusRingInset } from "../../utils/focus";
import { Button, type ButtonIntent, type ButtonSize } from "../Button/Button";
import { Divider } from "../Divider/Divider";
import { Icon, type IconName } from "../Icon/Icon";
import { MenuSurface } from "../MenuSurface/MenuSurface";
import type { SubNavLinkComponent } from "../SubNav/SubNav";

export enum MenuButtonTestId {
  Root = "menu-button-root",
  Trigger = "menu-button-trigger",
  Menu = "menu-button-menu",
  Item = "menu-button-item",
  Divider = "menu-button-divider",
}

export interface MenuButtonItem {
  id: string;
  label: string;
  icon?: IconName;
  disabled?: boolean;
  /** Paints the row's icon + label with the `bad` token (a destructive action). */
  danger?: boolean;
  /** Trailing mark rendered at the row's right edge (e.g. `"+"`, `"⚙"`, `"●"`). */
  trailing?: string;
  /** Renders the row as a real link (new-tab/middle-click friendly) instead of
   *  a button, resolved through `MenuButton`'s own `linkComponent` (same
   *  router-agnostic contract as `SubNav`), defaulting to `<a>`. */
  href?: string;
  /** Fires on select. Optional so a pure-navigation `href` row needs nothing
   *  else; a row may combine both (e.g. a link with a side-effect). */
  onSelect?: () => void;
}

/** A visual divider between item groups — give it a stable `id` like any row. */
export interface MenuButtonDivider {
  id: string;
  divider: true;
}

export type MenuButtonEntry = MenuButtonItem | MenuButtonDivider;

function isDivider(entry: MenuButtonEntry): entry is MenuButtonDivider {
  return "divider" in entry && entry.divider === true;
}

export interface MenuButtonProps {
  /** The action rows (and optional dividers) shown in the menu. */
  items: MenuButtonEntry[];
  intent?: ButtonIntent;
  size?: ButtonSize;
  /** Disables the trigger (and, transitively, the menu it would open). */
  disabled?: boolean;
  /** Accessible name for the trigger. Defaults to "Actions". */
  ariaLabel?: string;
  /** Overrides the rendered anchor for `href` items — pass the app's
   *  `next/link` `Link`, same contract as `SubNav`. Defaults to `<a>`. */
  linkComponent?: SubNavLinkComponent;
  /**
   * `"kebab"` (default) — the original `Button`-based icon-only trigger
   * (horizontal `⋯`, `intent`/`size` apply), with a sentence-case item list —
   * unchanged for existing consumers (`RoadmapCard`, `RunDetail`).
   *
   * `"bordered"` — the ZibbyCorp header overflow trigger: a 32×32 square
   * outline button (vertical `⋮`) that solidifies to an ink border + panel-2
   * fill while open, opening a 220px mono-uppercase panel with label-left /
   * trailing-mark-right rows (`AppHeader`'s `menu` slot).
   */
  variant?: "kebab" | "bordered";
}

/**
 * An icon-only trigger that opens a {@link MenuSurface} of action rows: the
 * pure "overflow menu" shape `DropDownButton` doesn't cover (that one is a
 * split button with a mandatory primary segment). Shares `DropDownButton`'s
 * proven mechanics: fixed-position portal, `updateRect` on scroll/resize,
 * ArrowUp/Down + Enter/Escape/Tab keyboard nav via `aria-activedescendant`,
 * the `fixed inset-0` click-catcher, and the menu-row markup with
 * `focusRingInset`. Keyboard `Enter` activates a row by clicking its real DOM
 * node (`document.getElementById`) rather than calling `onSelect` directly —
 * for an `href` row this makes the link's own navigation (e.g. Next's
 * client-side `Link`) fire exactly as a mouse click would, since the trigger
 * never actually hands focus to the row (`aria-activedescendant` keeps focus
 * on the trigger the whole time).
 */
export function MenuButton({
  items,
  intent = "ghost",
  size = "sm",
  disabled = false,
  ariaLabel = "Actions",
  linkComponent,
  variant = "kebab",
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
  const Link = linkComponent ?? "a";
  const bordered = variant === "bordered";

  // Arrow-key navigation walks real rows only — dividers aren't selectable.
  const navigableIndices = items.reduce<number[]>((acc, entry, i) => {
    if (!isDivider(entry)) acc.push(i);
    return acc;
  }, []);
  const navCount = navigableIndices.length;
  const activeNavIdx = navCount === 0 ? -1 : Math.min(activeIndex, navCount - 1);
  const activeRow = activeNavIdx === -1 ? -1 : (navigableIndices[activeNavIdx] ?? -1);
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

  const selectItem = useCallback(
    (item: MenuButtonItem) => {
      if (item.disabled) return;
      item.onSelect?.();
      close();
      triggerRef.current?.focus();
    },
    [close],
  );

  // See the component doc comment: clicks the row's real DOM node so an
  // `href` row's link navigation fires exactly as a mouse click would.
  const activate = useCallback(
    (i: number) => {
      const entry = items[i];
      if (!entry || isDivider(entry) || entry.disabled) return;
      document.getElementById(`${baseId}-item-${i}`)?.click();
    },
    [items, baseId],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      if (navCount === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        const from = i < 0 ? 0 : Math.min(i, navCount - 1);
        return (from + delta + navCount) % navCount;
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

  const panelMinWidth = bordered ? 220 : 200;

  // Position the fixed surface from the trigger rect, right-aligned under the
  // trigger. Flip above the trigger when there's more room there, and clamp
  // the height so the last rows never fall off-screen.
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
      left: Math.max(0, rect.right - panelMinWidth),
      minWidth: Math.max(panelMinWidth, rect.width),
    };
    return flip
      ? { bottom: viewportH - rect.top + gap, ...horizontal, maxHeight }
      : { top: rect.bottom + gap, ...horizontal, maxHeight };
  })();

  return (
    <div className="relative inline-flex" data-testid={MenuButtonTestId.Root}>
      {bordered ? (
        <button
          aria-activedescendant={open && activeRow >= 0 ? itemId(activeRow) : undefined}
          aria-controls={`${baseId}-menu`}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center border text-ink transition-colors",
            open ? "border-ink bg-panel-2" : "border-line-2 hover:border-ink",
            focusRing,
          )}
          data-testid={MenuButtonTestId.Trigger}
          disabled={disabled}
          onClick={() => (open ? close() : openMenu())}
          onKeyDown={handleKeyDown}
          ref={triggerRef}
          type="button"
        >
          <Icon name="dotsVertical" size="md" />
        </button>
      ) : (
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
      )}

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
                {items.map((entry, i) => {
                  if (isDivider(entry)) {
                    return (
                      <div
                        className="my-1"
                        data-testid={`${MenuButtonTestId.Divider}-${entry.id}`}
                        key={entry.id}
                      >
                        <Divider />
                      </div>
                    );
                  }

                  const item = entry;
                  const active = i === activeRow;
                  const danger = item.danger && !item.disabled;
                  const toneClass = danger ? "text-bad" : bordered ? "text-ink" : "text-foreground";
                  const rowClass = cn(
                    "w-full flex items-center gap-2.5 rounded-sm cursor-pointer border-none text-left",
                    focusRingInset,
                    "transition-colors duration-100",
                    bordered
                      ? "px-3 py-[9px] font-mono text-[11px] uppercase tracking-wider"
                      : "px-[11px] py-[9px]",
                    item.disabled
                      ? "cursor-not-allowed opacity-50"
                      : cn(
                          active
                            ? bordered
                              ? "bg-panel-2"
                              : "bg-surface"
                            : cn(
                                "bg-transparent",
                                bordered ? "hover:bg-panel-2" : "hover:bg-surface",
                              ),
                        ),
                    active && !item.disabled && "ring-1 ring-inset ring-border-strong",
                  );
                  const content = (
                    <>
                      {item.icon && (
                        <Icon name={item.icon} size="sm" tone={danger ? "bad" : undefined} />
                      )}
                      <span className={cn("flex-1", !bordered && "text-md", toneClass)}>
                        {item.label}
                      </span>
                      {item.trailing && <span className="text-ink-3">{item.trailing}</span>}
                    </>
                  );

                  if (item.href) {
                    return (
                      <Link
                        aria-disabled={item.disabled || undefined}
                        className={rowClass}
                        data-testid={`${MenuButtonTestId.Item}-${item.id}`}
                        href={item.href}
                        id={itemId(i)}
                        key={item.id}
                        onClick={() => selectItem(item)}
                        onPointerMove={() =>
                          !item.disabled && setActiveIndex(navigableIndices.indexOf(i))
                        }
                        role="menuitem"
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <button
                      aria-disabled={item.disabled || undefined}
                      className={rowClass}
                      data-testid={`${MenuButtonTestId.Item}-${item.id}`}
                      id={itemId(i)}
                      key={item.id}
                      onClick={() => selectItem(item)}
                      onPointerMove={() =>
                        !item.disabled && setActiveIndex(navigableIndices.indexOf(i))
                      }
                      role="menuitem"
                      type="button"
                    >
                      {content}
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
