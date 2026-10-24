"use client";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
  /** Secondary sub-text rendered under the label in the option row. */
  description?: string;
}

export enum DropdownTestId {
  Root = "dropdown-root",
  Trigger = "dropdown-trigger",
  Panel = "dropdown-panel",
  Option = "dropdown-option",
  Chip = "dropdown-chip",
  SelectAll = "dropdown-select-all",
  ChipsRow = "dropdown-chips-row",
  Overflow = "dropdown-overflow-chip",
}

/** Visual presentation of the trigger.
 * - `inline` — compact mono pill, auto width, right-aligned panel (toolbars, the language switcher).
 * - `field` — full-width form-control chrome matching `TextInput`/`TextArea`; used by `Select`. */
export type DropdownVariant = "inline" | "field";

/** Category tint for the `inline` trigger — mirrors `Tag`'s tone vocabulary
 * (minus the risk kinds, which are a categorical palette of their own). Lets a
 * row of same-shaped inline dropdowns (a mad-libs sentence) read apart by
 * field at a glance, the way `Tag` chips do in the read-only twin of that row. */
export type DropdownTone = "neutral" | "accent" | "ok" | "warn" | "bad" | "run";

const toneBorderBgClass: Record<DropdownTone, string> = {
  neutral: "border-border bg-hover",
  accent: "border-accent/35 bg-accent-solid",
  ok: "border-ok/35 bg-ok-solid",
  warn: "border-warn/35 bg-warn-solid",
  bad: "border-bad/35 bg-bad-solid",
  run: "border-run/35 bg-run-solid",
};

const toneTextClass: Record<DropdownTone, string> = {
  neutral: "text-foreground-dim",
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  run: "text-run",
};

/** Trigger density.
 * - `md` — the default, matching `Button` `md` / form-control height.
 * - `sm` — a compact trigger sized to sit alongside `Button` `size="sm"` in dense
 *   chrome like the top bar (the language switcher). */
export type DropdownSize = "sm" | "md";

interface DropdownBaseProps<T extends string = string> {
  options: DropdownOption<T>[];
  variant?: DropdownVariant;
  /** Trigger density; defaults to `md`. See {@link DropdownSize}. */
  size?: DropdownSize;
  /** Trigger element id — lets `Field`'s `<label htmlFor>` target it. */
  id?: string;
  /** Paints the trigger with the danger border/ring. The invalid state is
   * conveyed to assistive tech via the error message referenced by
   * `aria-describedby` (wired by `Field`), so the trigger stays a plain button. */
  invalid?: boolean;
  /** Category tint — see {@link DropdownTone}. Only meaningful on `variant="inline"`;
   * ignored on `field` (full-width form chrome doesn't carry a category), and
   * overridden by the `open`/`invalid` state colors while either is active. */
  tone?: DropdownTone;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export interface DropdownSingleProps<T extends string = string> extends DropdownBaseProps<T> {
  multi?: false;
  value: T;
  onChange: (value: T) => void;
  /** Shown (faint) in the trigger while `value` is `""` —
   * the placeholder-first state of a required select. */
  placeholder?: string;
  /** Trigger shows only the option `code` (falls back to `label` when no code),
   * omitting the full label — for dense chrome like the top-bar language switch.
   * The menu rows are unaffected (full labels remain). */
  compact?: boolean;
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
  /** Never grow past one row: chips that don't fit collapse into a trailing
   * "+N" indicator instead of wrapping to a second line. */
  compact?: boolean;
}

export type DropdownProps<T extends string = string> =
  | DropdownSingleProps<T>
  | DropdownMultiProps<T>;

export function Dropdown<T extends string = string>(props: DropdownProps<T>) {
  const {
    options,
    variant = "inline",
    size = "md",
    id,
    invalid = false,
    tone,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
  } = props;
  // Multi mode always wears the full-width field chrome (chips need the room).
  const isField = variant === "field" || props.multi === true;
  // Tone only tints the inline trigger at rest — `field` has no category concept,
  // and the open/invalid states already own the border/bg color.
  const toneClasses = tone && !isField ? toneBorderBgClass[tone] : undefined;
  // The set of selected values, normalized across single/multi for option rendering.
  const selected: T[] = props.multi ? props.value : [props.value];
  const isSelected = (v: T) => selected.includes(v);

  // Compact mode: cap the visible chips to whatever fits on one row and fold
  // the rest into a trailing "+N" chip instead of wrapping to a second line.
  const compact = props.multi === true && props.compact === true;
  // Single-select trigger showing only the option code (top-bar language switch).
  // Distinct from the multi `compact` above (which controls chip overflow).
  const compactTrigger = props.multi !== true && props.compact === true;
  const chipsRowRef = useRef<HTMLSpanElement>(null);
  const chipsMeasureRef = useRef<HTMLDivElement>(null);
  const [visibleChipCount, setVisibleChipCount] = useState(selected.length);
  const selectedKey = selected.join("\u0000");
  const optionsKey = options.map((o) => `${o.value}:${o.label}`).join("\u0000");

  // Measures the hidden clone row (real chip markup, off-screen) against the
  // visible row's available width, so the algorithm reacts to actual label
  // widths/fonts rather than a fixed character-count guess.
  useLayoutEffect(() => {
    if (!compact || selected.length === 0) return;
    const row = chipsRowRef.current;
    const measure = chipsMeasureRef.current;
    if (!row || !measure) return;

    const recompute = () => {
      const available = row.clientWidth;
      const nodes = Array.from(measure.children) as HTMLElement[];
      const overflowNode = nodes[nodes.length - 1];
      const itemNodes = nodes.slice(0, -1);
      const overflowWidth = overflowNode?.getBoundingClientRect().width ?? 0;
      const gap = 6; // matches the row's gap-1.5
      let used = 0;
      let count = 0;
      for (let i = 0; i < itemNodes.length; i++) {
        const w = itemNodes[i]?.getBoundingClientRect().width ?? 0;
        const withGap = used + (count > 0 ? gap : 0) + w;
        const hasMore = i < itemNodes.length - 1;
        const overflowReserve = hasMore ? gap + overflowWidth : 0;
        if (withGap + overflowReserve > available && count > 0) break;
        used = withGap;
        count++;
      }
      setVisibleChipCount(Math.max(1, count));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(row);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, selectedKey, optionsKey]);

  const visibleSelected = compact ? selected.slice(0, visibleChipCount) : selected;
  const hiddenChipCount = compact ? selected.length - visibleSelected.length : 0;
  const hiddenChipLabels = selected
    .slice(visibleSelected.length)
    .map((val) => options.find((o) => o.value === val)?.label ?? val)
    .join(", ");

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

  // Position the fixed surface from the trigger rect. Horizontal: the panel sizes to
  // its longest option (`width: max-content`), floored at the trigger's width (so it
  // never looks narrower than the trigger) and capped at the remaining viewport space
  // (so it never runs off-screen — option labels then truncate instead). The field
  // variant stays left-aligned to the trigger; the inline variant stays right-aligned
  // to the trigger's right edge, so growth goes left. Vertical: open downward, but
  // flip above the trigger when there's more room there, and clamp the height to the
  // available space so the last rows never fall off-screen — the surface's own
  // `overflow-y-auto` scrolls the remainder (page scroll can't reveal them, since the
  // fixed menu re-pins to the trigger).
  const menuStyle: CSSProperties | undefined = (() => {
    if (!rect) return undefined;
    const gap = 6;
    const viewportMargin = 8;
    const floor = 168;
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 0;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 0;
    const spaceBelow = viewportH - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const flip = spaceBelow < 220 && spaceAbove > spaceBelow;
    const available = Math.max(flip ? spaceAbove : spaceBelow, 0);
    // Cap at 60vh (the original feel) but never collapse below a usable floor.
    const maxHeight = Math.min(Math.max(available, 140), viewportH * 0.6);
    const horizontal: CSSProperties = isField
      ? {
          left: rect.left,
          width: "max-content",
          minWidth: rect.width,
          maxWidth: Math.max(rect.width, viewportW - rect.left - viewportMargin),
        }
      : {
          right: Math.max(0, viewportW - rect.right),
          width: "max-content",
          minWidth: Math.max(floor, rect.width),
          maxWidth: Math.max(floor, rect.right - viewportMargin),
        };
    return flip
      ? { bottom: viewportH - rect.top + gap, ...horizontal, maxHeight }
      : { top: rect.bottom + gap, ...horizontal, maxHeight };
  })();

  const triggerClasses = cn(
    "items-center gap-2 cursor-pointer border outline-none",
    "focus-visible:ring-2 transition-all duration-150",
    isField
      ? cn("flex w-full rounded font-sans", size === "sm" ? "px-3 py-1.5" : "px-3.5 py-2.5")
      : cn(
          "inline-flex rounded-sm font-mono font-semibold",
          size === "sm" ? "px-2.5 py-1 text-sm" : "px-[11px] py-2 text-base",
        ),
    open
      ? "border-ink bg-background"
      : invalid
        ? "border-bad bg-surface"
        : (toneClasses ?? "border-border bg-surface"),
    invalid ? "focus-visible:ring-bad" : "focus-visible:ring-foreground",
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
    <span
      className={cn(
        "inline-flex text-foreground-faint transition-transform duration-150",
        open && "rotate-90",
      )}
    >
      <Icon name="chevron" size="sm" />
    </span>
  );

  return (
    <div className="relative" data-testid={DropdownTestId.Root}>
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
          className={cn(
            triggerClasses,
            compact ? "flex-nowrap overflow-hidden h-[42px]" : "flex-wrap min-h-[42px]",
          )}
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
            <span
              className={cn(
                "flex flex-1 items-center gap-1.5",
                compact ? "flex-nowrap overflow-hidden" : "flex-wrap",
              )}
              data-testid={DropdownTestId.ChipsRow}
              ref={chipsRowRef}
            >
              {visibleSelected.map((val) => {
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
              {hiddenChipCount > 0 && (
                <Chip
                  data-testid={DropdownTestId.Overflow}
                  key="__overflow__"
                  title={hiddenChipLabels}
                  tone="idle"
                >
                  {`+${hiddenChipCount}`}
                </Chip>
              )}
            </span>
          )}
          {compact && selected.length > 0 && (
            // Off-screen clone of the real chip markup — measured (never painted)
            // so the overflow algorithm reacts to actual rendered widths.
            <div
              aria-hidden
              className="pointer-events-none fixed left-0 top-0 -z-10 flex items-center gap-1.5 opacity-0"
              ref={chipsMeasureRef}
            >
              {selected.map((val) => {
                const opt = options.find((o) => o.value === val);
                return (
                  <Chip closable key={val} tone="idle">
                    {opt?.label ?? val}
                  </Chip>
                );
              })}
              <Chip key="__overflow_measure__" tone="idle">
                {`+${selected.length}`}
              </Chip>
            </div>
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
                {(!compactTrigger || current?.code === undefined) && (
                  <span
                    className={cn(
                      isField
                        ? "flex-1 text-left text-md text-foreground"
                        : cn(
                            tone && !invalid ? toneTextClass[tone] : "text-foreground-dim",
                            "font-normal text-caption",
                          ),
                    )}
                  >
                    {current?.label ??
                      (props.value === "" && props.placeholder ? (
                        <span className="text-foreground-faint">{props.placeholder}</span>
                      ) : (
                        props.value
                      ))}
                  </span>
                )}
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
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-md text-foreground">{opt.label}</span>
                        {opt.description && (
                          <span className="block truncate text-xs text-foreground-faint">
                            {opt.description}
                          </span>
                        )}
                      </span>
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
