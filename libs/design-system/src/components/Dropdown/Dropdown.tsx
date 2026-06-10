"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Icon } from "../Icon/Icon";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
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
        onClick={() => setOpen((o) => !o)}
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

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            className={cn(
              "absolute top-[calc(100%+6px)] z-50",
              isField ? "left-0 right-0" : "right-0 min-w-[168px]",
              "bg-raised border border-border rounded-md overflow-hidden p-1",
              "shadow-dropdown",
            )}
            data-testid={DropdownTestId.Panel}
            role="listbox"
          >
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  aria-selected={selected}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-[11px] py-[9px]",
                    "rounded-sm cursor-pointer border-none text-left",
                    focusRingInset,
                    "transition-colors duration-100",
                    selected ? "bg-accent-dim" : "bg-transparent hover:bg-surface",
                  )}
                  data-testid={DropdownTestId.Option}
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    close();
                  }}
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
        </>
      )}
    </div>
  );
}
