"use client";

import { type Ref, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DENSITIES, type Density } from "../../tokens";
import { cn } from "../../utils/cn";

export enum DensityMenuTestId {
  Root = "density-menu-root",
  Trigger = "density-menu-trigger",
  Menu = "density-menu-menu",
  /** Suffixed with the density, e.g. `density-menu-option-airy`. */
  Option = "density-menu-option",
}

/** y-positions of the four glyph lines (16×16 viewBox), per density. */
const GLYPH_Y: Record<Density, readonly [number, number, number, number]> = {
  compact: [3, 6, 9, 12],
  comfort: [2, 5.5, 9, 12.5],
  airy: [1.5, 5, 10, 13.5],
  open: [1, 4.5, 10.5, 14],
};

function Glyph({ density }: { density: Density }) {
  return (
    <svg aria-hidden className="block" height={16} viewBox="0 0 16 16" width={16}>
      <g stroke="currentColor" strokeWidth={1.4}>
        {GLYPH_Y[density].map((y) => (
          <line key={y} x1={2} x2={14} y1={y} y2={y} />
        ))}
      </g>
    </svg>
  );
}

export interface DensityMenuProps {
  value: Density;
  onChange: (density: Density) => void;
  /** Option labels. */
  labels: Record<Density, string>;
  /** Accessible name / tooltip of the trigger. */
  label: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Density picker: a trigger showing the current density's four-line glyph + ▾ and a
 * 160px rounded menu listing compact / comfort / airy / open, each with its glyph.
 * Closes on selection, outside click and Escape. The menu is a fixed-position portal so a
 * scrolling / clipping ancestor (the sub-nav bar) never hides it.
 */
export function DensityMenu({ value, onChange, labels, label, ref }: DensityMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const reposition = () => {
      if (rootRef.current) setRect(rootRef.current.getBoundingClientRect());
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return (
    <div
      className="relative"
      data-testid={DensityMenuTestId.Root}
      ref={(el) => {
        rootRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
    >
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className="flex cursor-pointer items-center gap-[6px] rounded-md border border-line-2 bg-panel px-[8px] py-[6px] text-ink hover:bg-hover"
        data-testid={DensityMenuTestId.Trigger}
        onClick={() => setOpen((o) => !o)}
        title={label}
        type="button"
      >
        <Glyph density={value} />
        <span className="text-[9px] text-ink-3">▾</span>
      </button>
      {open && rect
        ? createPortal(
            <div
              className="fixed z-50 flex w-[160px] flex-col gap-0.5 rounded-lg border border-line-2 bg-panel p-1 font-sans text-[13px] tracking-normal shadow-dropdown"
              data-testid={DensityMenuTestId.Menu}
              id={menuId}
              ref={menuRef}
              role="listbox"
              style={{ top: rect.bottom + 6, right: window.innerWidth - rect.right }}
            >
              {DENSITIES.map((d) => (
                <button
                  aria-selected={d === value}
                  className={cn(
                    "flex cursor-pointer items-center gap-[10px] rounded-sm px-[10px] py-[7px] text-left hover:bg-hover",
                    d === value ? "bg-raised text-ink" : "text-ink-2",
                  )}
                  data-testid={`${DensityMenuTestId.Option}-${d}`}
                  key={d}
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <Glyph density={d} />
                  <span>{labels[d]}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
