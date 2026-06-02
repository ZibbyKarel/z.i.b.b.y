"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
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

export interface DropdownProps<T extends string = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label"?: string;
}

export function Dropdown<T extends string = string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: DropdownProps<T>) {
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
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center gap-2 px-[11px] py-2 cursor-pointer",
          "font-mono text-base font-semibold border rounded-sm",
          "outline-none focus-visible:ring-2 focus-visible:ring-accent",
          "transition-all duration-150",
          open ? "border-accent bg-background" : "border-border bg-transparent",
        )}
        data-testid={DropdownTestId.Trigger}
        onClick={() => setOpen((o) => !o)}
        ref={triggerRef}
        type="button"
      >
        {current?.code !== undefined && (
          <span className="text-accent">{current.code}</span>
        )}
        <span className="text-foreground-dim font-normal text-caption">
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
              "absolute top-[calc(100%+6px)] right-0 z-50 min-w-[168px]",
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
                    "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
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
