"use client";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Icon } from "../Icon/Icon";
import { MenuSurface } from "../MenuSurface/MenuSurface";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  code?: string;
}

export enum DropdownTestId {
  Trigger = "dropdown-trigger",
  Panel = "dropdown-panel",
  Option = "dropdown-option",
}

/** Visual presentation of the trigger.
 * - `inline` — compact mono pill, auto width, right-aligned panel (toolbars, the language switcher).
 * - `field` — full-width form-control chrome matching `TextInput`/`TextArea`; used by `Select`. */
export type DropdownVariant = "inline" | "field";

export interface DropdownProps<T extends string = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: DropdownVariant;
  /** Trigger element id — lets `Field`'s `<label htmlFor>` target it. */
  id?: string;
  /** Paints the trigger with the danger border/ring. The invalid state is
   * conveyed to assistive tech via the error message referenced by
   * `aria-describedby` (wired by `Field`), so the trigger stays a plain button. */
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export function Dropdown<T extends string = string>({
  options,
  value,
  onChange,
  variant = "inline",
  id,
  invalid = false,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: DropdownProps<T>) {
  const isField = variant === "field";
  const [open, setOpen] = useState(false);
  // Highlighted row for keyboard navigation (focus stays on the trigger; the menu
  // is driven via `aria-activedescendant`, mirroring SearchMenu).
  const [activeIndex, setActiveIndex] = useState(0);
  // The trigger's viewport rect, captured on open and kept fresh on scroll/resize,
  // so the portaled (fixed) menu can be positioned without an ancestor clipping it.
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const current = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);
  // Clamp at read time so a shrunken list never leaves the highlight out of range.
  const activeRow = options.length === 0 ? -1 : Math.min(activeIndex, options.length - 1);
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const close = useCallback(() => setOpen(false), []);

  const updateRect = useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  const openMenu = useCallback(() => {
    updateRect();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [updateRect, selectedIndex]);

  const commit = useCallback(
    (i: number) => {
      const opt = options[i];
      if (opt) onChange(opt.value);
      close();
      triggerRef.current?.focus();
    },
    [options, onChange, close],
  );

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      if (options.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        const from = i < 0 ? 0 : Math.min(i, options.length - 1);
        return (from + delta + options.length) % options.length;
      });
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) openMenu();
      else if (activeRow >= 0) commit(activeRow);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab" && open) {
      // Let focus leave naturally, but don't strand an open menu behind it.
      close();
    }
  };

  // Position the fixed surface from the trigger rect: field variant stretches to
  // the trigger's width; the compact inline variant right-aligns with a min width.
  const menuStyle: CSSProperties | undefined = rect
    ? isField
      ? { top: rect.bottom + 6, left: rect.left, width: rect.width }
      : {
          top: rect.bottom + 6,
          left: Math.max(0, rect.right - 168),
          minWidth: Math.max(168, rect.width),
        }
    : undefined;

  return (
    <div className="relative">
      <button
        aria-activedescendant={open && activeRow >= 0 ? optionId(activeRow) : undefined}
        aria-controls={open ? `${baseId}-listbox` : undefined}
        aria-describedby={ariaDescribedBy}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn(
          "items-center gap-2 cursor-pointer border outline-none",
          "focus-visible:ring-2 transition-all duration-150",
          isField
            ? "flex w-full px-3.5 py-2.5 rounded font-sans"
            : "inline-flex px-[11px] py-2 rounded-sm font-mono text-base font-semibold",
          open
            ? "border-accent bg-background"
            : invalid
              ? "border-bad bg-transparent"
              : "border-border bg-transparent",
          invalid ? "focus-visible:ring-bad" : "focus-visible:ring-accent",
        )}
        data-testid={DropdownTestId.Trigger}
        id={id}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        type="button"
      >
        {current?.code !== undefined && (
          <span className={cn("text-accent", isField && "font-mono text-sm")}>
            {current.code}
          </span>
        )}
        <span
          className={cn(
            isField
              ? "flex-1 text-left text-md text-foreground"
              : "text-foreground-dim font-normal text-caption",
          )}
        >
          {current?.label ?? value}
        </span>
        <Icon
          className={cn(
            "text-foreground-faint transition-transform duration-150",
            open && "rotate-90",
          )}
          name="chevron"
          size="sm"
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <MenuSurface
              align={isField ? "stretch" : "end"}
              data-testid={DropdownTestId.Panel}
              id={`${baseId}-listbox`}
              placement="fixed"
              role="listbox"
              style={menuStyle}
            >
              <div className="p-1">
                {options.map((opt, i) => {
                  const selected = opt.value === value;
                  const active = i === activeRow;
                  return (
                    <button
                      aria-selected={selected}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-[11px] py-[9px]",
                        "rounded-sm cursor-pointer border-none text-left",
                        focusRingInset,
                        "transition-colors duration-100",
                        selected
                          ? "bg-accent-dim"
                          : active
                            ? "bg-surface"
                            : "bg-transparent hover:bg-surface",
                        active && "ring-1 ring-inset ring-border-strong",
                      )}
                      data-testid={DropdownTestId.Option}
                      id={optionId(i)}
                      key={opt.value}
                      onClick={() => commit(i)}
                      onPointerMove={() => setActiveIndex(i)}
                      role="option"
                      type="button"
                    >
                      {opt.code !== undefined && (
                        <span
                          className={cn(
                            "font-mono text-base font-semibold w-[22px]",
                            selected ? "text-accent" : "text-foreground-dim",
                          )}
                        >
                          {opt.code}
                        </span>
                      )}
                      <span className="text-md text-foreground flex-1">{opt.label}</span>
                      {selected && (
                        <Icon name="check" size="sm" stroke="medium" tone="accent" />
                      )}
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
