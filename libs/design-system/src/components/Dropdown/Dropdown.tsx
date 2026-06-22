"use client";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Checkbox } from "../Checkbox/Checkbox";
import { Chip } from "../Chip/Chip";
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
  Chip = "dropdown-chip",
  SelectAll = "dropdown-select-all",
}

/** Visual presentation of the trigger.
 * - `inline` — compact mono pill, auto width, right-aligned panel (toolbars, the language switcher).
 * - `field` — full-width form-control chrome matching `TextInput`/`TextArea`; used by `Select`. */
export type DropdownVariant = "inline" | "field";

interface DropdownBaseProps<T extends string = string> {
  options: DropdownOption<T>[];
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

export interface DropdownSingleProps<T extends string = string> extends DropdownBaseProps<T> {
  multi?: false;
  value: T;
  onChange: (value: T) => void;
}

export interface DropdownMultiProps<T extends string = string> extends DropdownBaseProps<T> {
  /** Pick-many mode: options carry a checkbox and selections render as removable chips. */
  multi: true;
  value: T[];
  onChange: (value: T[]) => void;
  /** Shown in the trigger when nothing is selected. */
  placeholder?: string;
  /** Accessible name for each selected chip's remove button. Defaults to "Remove". */
  removeLabel?: string;
  /** Render a leading "select all" row in the menu that toggles every option at once. */
  showSelectAll?: boolean;
  /** Label for the select-all row when not everything is selected. Defaults to "Select all". */
  selectAllLabel?: string;
  /** Label for the select-all row when everything is already selected. Defaults to "Clear all". */
  deselectAllLabel?: string;
}

export type DropdownProps<T extends string = string> =
  | DropdownSingleProps<T>
  | DropdownMultiProps<T>;

export function Dropdown<T extends string = string>(props: DropdownProps<T>) {
  const {
    options,
    variant = "inline",
    id,
    invalid = false,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
  } = props;
  // Multi mode always wears the full-width field chrome (chips need the room).
  const isField = variant === "field" || props.multi === true;
  // The set of selected values, normalized across single/multi for option rendering.
  const selected: T[] = props.multi ? props.value : [props.value];
  const isSelected = (v: T) => selected.includes(v);

  // Whether every option is currently selected — drives the select-all row's
  // checked state and its toggle direction (select-all vs clear-all).
  const allSelected =
    props.multi === true && options.length > 0 && options.every((o) => isSelected(o.value));
  // A leading "select all" row only makes sense in multi mode with options to pick.
  const hasSelectAll = props.multi === true && props.showSelectAll === true && options.length > 0;

  // The navigable rows, abstracting over the optional select-all entry so keyboard
  // navigation and `aria-activedescendant` index one flat list.
  type Row = { kind: "all" } | { kind: "option"; opt: DropdownOption<T>; optIndex: number };
  // Memoized so its identity is stable across renders — `activate` depends on it.
  const rows = useMemo<Row[]>(
    () => [
      ...(hasSelectAll ? [{ kind: "all" as const }] : []),
      ...options.map((opt, optIndex) => ({ kind: "option" as const, opt, optIndex })),
    ],
    [hasSelectAll, options],
  );

  const [open, setOpen] = useState(false);
  // Highlighted row for keyboard navigation (focus stays on the trigger; the menu
  // is driven via `aria-activedescendant`, mirroring SearchMenu).
  const [activeIndex, setActiveIndex] = useState(0);
  // The trigger's viewport rect, captured on open and kept fresh on scroll/resize,
  // so the portaled (fixed) menu can be positioned without an ancestor clipping it.
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  // First selected row's index — where the keyboard highlight lands on open.
  const firstSelectedIndex = rows.findIndex((r) => r.kind === "option" && isSelected(r.opt.value));
  // Clamp at read time so a shrunken list never leaves the highlight out of range.
  const activeRow = rows.length === 0 ? -1 : Math.min(activeIndex, rows.length - 1);
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const close = useCallback(() => setOpen(false), []);

  const updateRect = useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  const openMenu = useCallback(() => {
    updateRect();
    setActiveIndex(firstSelectedIndex >= 0 ? firstSelectedIndex : 0);
    setOpen(true);
  }, [updateRect, firstSelectedIndex]);

  // Single-select commit: set value, close, return focus to the trigger.
  const commitSingle = useCallback(
    (i: number) => {
      if (props.multi) return;
      const opt = options[i];
      if (opt) props.onChange(opt.value);
      close();
      triggerRef.current?.focus();
    },
    [props, options, close],
  );

  // Multi-select toggle: flip membership, keep the menu open.
  const toggleMulti = useCallback(
    (v: T) => {
      if (!props.multi) return;
      props.onChange(
        props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v],
      );
    },
    [props],
  );

  const removeMulti = useCallback(
    (v: T) => {
      if (!props.multi) return;
      props.onChange(props.value.filter((x) => x !== v));
    },
    [props],
  );

  // Select-all toggle: when everything is already selected, clear; otherwise pick
  // every option. Keeps the menu open like any other multi toggle.
  const toggleAll = useCallback(() => {
    if (!props.multi) return;
    const all = options.map((o) => o.value);
    const isAll = all.length > 0 && all.every((v) => props.value.includes(v));
    props.onChange(isAll ? [] : all);
  }, [props, options]);

  // Pick a row by its navigation index — the select-all row toggles every option,
  // an option row toggles (multi) or commits (single).
  const activate = useCallback(
    (i: number) => {
      const row = rows[i];
      if (!row) return;
      if (row.kind === "all") {
        toggleAll();
        return;
      }
      if (props.multi) toggleMulti(row.opt.value);
      else commitSingle(row.optIndex);
    },
    [rows, props.multi, toggleAll, toggleMulti, commitSingle],
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

  // Typed to the widest element so the one handler serves both the combobox
  // `<div>` (multi) and the `<button>` (single) triggers.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      if (rows.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        const from = i < 0 ? 0 : Math.min(i, rows.length - 1);
        return (from + delta + rows.length) % rows.length;
      });
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActiveIndex(rows.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) openMenu();
      else if (activeRow >= 0) activate(activeRow);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab" && open) {
      // Let focus leave naturally, but don't strand an open menu behind it.
      close();
    }
  };

  // Position the fixed surface from the trigger rect. Horizontal: the field variant
  // stretches to the trigger's width; the compact inline variant right-aligns with a
  // min width. Vertical: open downward, but flip above the trigger when there's more
  // room there, and clamp the height to the available space so the last rows never
  // fall off-screen — the surface's own `overflow-y-auto` scrolls the remainder
  // (page scroll can't reveal them, since the fixed menu re-pins to the trigger).
  const menuStyle: CSSProperties | undefined = (() => {
    if (!rect) return undefined;
    const gap = 6;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 0;
    const spaceBelow = viewportH - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const flip = spaceBelow < 220 && spaceAbove > spaceBelow;
    const available = Math.max(flip ? spaceAbove : spaceBelow, 0);
    // Cap at 60vh (the original feel) but never collapse below a usable floor.
    const maxHeight = Math.min(Math.max(available, 140), viewportH * 0.6);
    const horizontal: CSSProperties = isField
      ? { left: rect.left, width: rect.width }
      : { left: Math.max(0, rect.right - 168), minWidth: Math.max(168, rect.width) };
    return flip
      ? { bottom: viewportH - rect.top + gap, ...horizontal, maxHeight }
      : { top: rect.bottom + gap, ...horizontal, maxHeight };
  })();

  const triggerClasses = cn(
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
  );

  const sharedTriggerProps = {
    "aria-activedescendant": open && activeRow >= 0 ? optionId(activeRow) : undefined,
    "aria-controls": `${baseId}-listbox`,
    "aria-describedby": ariaDescribedBy,
    "aria-expanded": open,
    "aria-label": ariaLabel,
    "data-testid": DropdownTestId.Trigger,
    id,
    onKeyDown: handleKeyDown,
  };

  const chevron = (
    <Icon
      className={cn("text-foreground-faint transition-transform duration-150", open && "rotate-90")}
      name="chevron"
      size="sm"
    />
  );

  return (
    <div className="relative">
      {props.multi ? (
        // Multi trigger: a focusable combobox CONTAINER (not a button) so the
        // selected chips — each with its own remove button — can live inside it
        // without nesting interactive elements.
        <div
          {...sharedTriggerProps}
          // aria-expanded/aria-controls are also listed here (not just via the
          // spread) so the static a11y linter can see the combobox's required props.
          aria-controls={`${baseId}-listbox`}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(triggerClasses, "flex-wrap min-h-[42px]")}
          onClick={() => (open ? close() : openMenu())}
          ref={triggerRef}
          role="combobox"
          tabIndex={0}
        >
          {selected.length === 0 ? (
            <span className="flex-1 text-left text-md text-foreground-faint">
              {props.placeholder ?? ""}
            </span>
          ) : (
            <span className="flex flex-1 flex-wrap items-center gap-1.5">
              {selected.map((val) => {
                const opt = options.find((o) => o.value === val);
                return (
                  <Chip
                    closable
                    closeLabel={props.removeLabel ?? "Remove"}
                    data-testid={`${DropdownTestId.Chip}-${val}`}
                    key={val}
                    onClose={() => removeMulti(val)}
                    tone="idle"
                  >
                    {opt?.label ?? val}
                  </Chip>
                );
              })}
            </span>
          )}
          {chevron}
        </div>
      ) : (
        <button
          {...sharedTriggerProps}
          aria-haspopup="listbox"
          className={triggerClasses}
          onClick={() => (open ? close() : openMenu())}
          ref={triggerRef as unknown as React.Ref<HTMLButtonElement>}
          type="button"
        >
          {(() => {
            const current = options.find((o) => o.value === props.value);
            return (
              <>
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
                  {current?.label ?? props.value}
                </span>
              </>
            );
          })()}
          {chevron}
        </button>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <MenuSurface
              scroll
              align={isField ? "stretch" : "end"}
              aria-multiselectable={props.multi ? true : undefined}
              data-testid={DropdownTestId.Panel}
              id={`${baseId}-listbox`}
              placement="fixed"
              role="listbox"
              style={menuStyle}
            >
              <div className="p-1">
                {rows.map((row, i) => {
                  const active = i === activeRow;
                  const rowClasses = cn(
                    "w-full flex items-center gap-2.5 px-[11px] py-[9px]",
                    "rounded-sm cursor-pointer border-none text-left",
                    focusRingInset,
                    "transition-colors duration-100",
                    active ? "bg-surface" : "bg-transparent hover:bg-surface",
                    active && "ring-1 ring-inset ring-border-strong",
                  );

                  if (row.kind === "all") {
                    // The select-all row only exists in multi mode (see `hasSelectAll`),
                    // so reading the multi-only labels here is sound.
                    const customLabel = props.multi
                      ? allSelected
                        ? props.deselectAllLabel
                        : props.selectAllLabel
                      : undefined;
                    const label = customLabel ?? (allSelected ? "Clear all" : "Select all");
                    return (
                      <button
                        aria-selected={allSelected}
                        className={cn(rowClasses, "border-b border-border")}
                        data-testid={DropdownTestId.SelectAll}
                        id={optionId(i)}
                        key="__select_all__"
                        onClick={() => activate(i)}
                        onPointerMove={() => setActiveIndex(i)}
                        role="option"
                        type="button"
                      >
                        <Checkbox presentational checked={allSelected} size="sm" />
                        <span className="text-md text-foreground flex-1 font-medium">{label}</span>
                      </button>
                    );
                  }

                  const { opt } = row;
                  const selectedOpt = isSelected(opt.value);
                  return (
                    <button
                      aria-selected={selectedOpt}
                      className={cn(
                        rowClasses,
                        selectedOpt && !props.multi && "bg-accent-dim hover:bg-accent-dim",
                      )}
                      data-testid={DropdownTestId.Option}
                      id={optionId(i)}
                      key={opt.value}
                      onClick={() => activate(i)}
                      onPointerMove={() => setActiveIndex(i)}
                      role="option"
                      type="button"
                    >
                      {props.multi && <Checkbox presentational checked={selectedOpt} size="sm" />}
                      {opt.code !== undefined && (
                        <span
                          className={cn(
                            "font-mono text-base font-semibold w-[22px]",
                            selectedOpt ? "text-accent" : "text-foreground-dim",
                          )}
                        >
                          {opt.code}
                        </span>
                      )}
                      <span className="text-md text-foreground flex-1">{opt.label}</span>
                      {selectedOpt && !props.multi && (
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
