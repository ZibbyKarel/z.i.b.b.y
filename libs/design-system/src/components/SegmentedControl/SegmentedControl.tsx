"use client";

import type { KeyboardEvent, Ref } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { StateDot } from "../StatePill/StatePill";

export type SegmentedControlSize = "sm" | "md";

export interface SegmentedControlItem {
  value: string;
  label: string;
  /** Leading status dot, tinted by the canonical state vocabulary. */
  dot?: StateTone;
}

export enum SegmentedControlTestId {
  Root = "segmented-control-root",
  /** Each item button is suffixed with its `value`, e.g. `segmented-control-item-auto`. */
  Item = "segmented-control-item",
  Dot = "segmented-control-dot",
}

export interface SegmentedControlProps {
  items: SegmentedControlItem[];
  value: string;
  onChange: (value: string) => void;
  size?: SegmentedControlSize;
  /** Accessible label for the radiogroup. */
  ariaLabel?: string;
  /** Id of an external label element — wins over `ariaLabel`. */
  ariaLabelledby?: string;
  ref?: Ref<HTMLDivElement>;
}

const sizeClass: Record<SegmentedControlSize, string> = {
  sm: "px-[8px] py-[5px] text-[10px]",
  md: "px-[10px] py-[6px] text-[10px]",
};

/** Every enabled item button inside the closest `role="radiogroup"` ancestor, in DOM order. */
function queryItems(current: HTMLElement): HTMLButtonElement[] {
  const group = current.closest('[role="radiogroup"]');
  return group
    ? Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'))
    : [];
}

/**
 * DS.md §8 segmented control — a hairline-bounded row of mutually exclusive
 * options, the selected one filled `--ink`. WAI-ARIA APG "Radio Group": arrow
 * keys move focus *and* selection together (unlike a tablist, where Enter/Space
 * is a separate activation step); `Home`/`End` jump to the first/last item.
 */
export function SegmentedControl({
  items,
  value,
  onChange,
  size = "md",
  ariaLabel,
  ariaLabelledby,
  ref,
}: SegmentedControlProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const all = queryItems(e.currentTarget);
    if (all.length === 0) return;
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIndex = (index + 1) % items.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      nextIndex = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const target = all[nextIndex];
    const nextItem = items[nextIndex];
    if (!target || !nextItem) return;
    target.focus();
    onChange(nextItem.value);
  };

  return (
    <div
      aria-label={ariaLabelledby ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledby}
      className="inline-flex border border-border-strong"
      data-testid={SegmentedControlTestId.Root}
      ref={ref}
      role="radiogroup"
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            aria-checked={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-none border-none font-mono font-semibold uppercase tracking-wider transition-colors",
              focusRingInset,
              sizeClass[size],
              active
                ? "bg-ink text-panel"
                : "bg-transparent text-foreground-faint hover:text-foreground",
            )}
            data-testid={`${SegmentedControlTestId.Item}-${item.value}`}
            key={item.value}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            role="radio"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {item.dot && (
              <StateDot data-testid={SegmentedControlTestId.Dot} px={6} state={item.dot} />
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
