"use client";
import {
  type ReactElement,
  type ReactNode,
  cloneElement,
  isValidElement,
  useId,
  useState,
} from "react";
import { cn } from "../../utils/cn";

export enum TooltipTestId {
  Root = "tooltip-root",
  Content = "tooltip-content",
}

export type TooltipSide = "top" | "bottom";

export interface TooltipProps {
  /** The bubble content shown on hover/focus (plain string or rich node). */
  content: ReactNode;
  /** The trigger — a single focusable element (e.g. an icon `Button`). */
  children: ReactElement;
  /** Which side of the trigger the bubble appears on (default `top`). */
  side?: TooltipSide;
}

const sideClass: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
};

/**
 * A hover/focus tooltip: wraps a single focusable trigger and reveals a small
 * bubble describing it. The bubble is shown on pointer hover and on keyboard
 * focus (events bubble from the trigger), and is wired to the trigger via
 * `aria-describedby` so it is announced. Positioned with pure CSS relative to the
 * trigger — intended for short hints, not long-form popovers.
 */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": open ? id : undefined,
      })
    : children;

  return (
    <span
      className="relative inline-flex"
      data-testid={TooltipTestId.Root}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) setOpen(false);
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {trigger}
      {open && (
        <span
          className={cn(
            "pointer-events-none absolute z-50 w-max max-w-[240px] rounded-sm border border-border-strong bg-elevated px-2 py-1 font-sans text-xs leading-snug text-foreground-dim shadow-[var(--shadow-modal)]",
            sideClass[side],
          )}
          data-testid={TooltipTestId.Content}
          id={id}
          role="tooltip"
        >
          {content}
        </span>
      )}
    </span>
  );
}
