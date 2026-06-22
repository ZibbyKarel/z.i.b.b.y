import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Icon } from "../Icon/Icon";
import { type DotTone, StatusDot } from "../StatusDot/StatusDot";

/** Chip tones mirror the status palette so the optional dot stays in sync. */
export type ChipTone = DotTone;

const toneClass: Record<ChipTone, string> = {
  ok: "text-ok border-ok/20 bg-ok/[0.06]",
  run: "text-run border-run/20 bg-run/[0.06]",
  wait: "text-warn border-warn/20 bg-warn/[0.06]",
  bad: "text-bad border-bad/20 bg-bad/[0.06]",
  idle: "text-foreground-faint border-border bg-[rgba(255,255,255,0.03)]",
  accent: "text-accent border-accent/20 bg-accent/[0.06]",
};

export enum ChipTestId {
  Root = "chip-root",
  Dot = "chip-dot",
  Close = "chip-close",
}

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  tone?: ChipTone;
  /** Show a leading status dot. */
  dot?: boolean;
  /** Live — the dot glows and pulses (only meaningful with `dot`). */
  pulse?: boolean;
  /** Show a trailing close (✕) button. Fires {@link ChipProps.onClose} on click. */
  closable?: boolean;
  /** Called when the close button is clicked (only meaningful with `closable`). */
  onClose?: () => void;
  /** Accessible name for the close button (icon-only). Defaults to "Remove". */
  closeLabel?: string;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * Rounded status pill — a tone-coloured label, optionally led by a status dot.
 * The "color = state" half of the badge family (the angular {@link Tag} is the
 * "shape = category" half).
 */
export function Chip({
  tone = "idle",
  dot = false,
  pulse = false,
  closable = false,
  onClose,
  closeLabel = "Remove",
  children,
  ref,
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-[3px]",
        dot ? "pl-2" : "pl-2.5",
        closable ? "pr-1.5" : "pr-2.5",
        "font-mono text-xs whitespace-nowrap",
        toneClass[tone],
      )}
      data-testid={ChipTestId.Root}
      ref={ref}
      {...props}
    >
      {dot && <StatusDot data-testid={ChipTestId.Dot} pulse={pulse} size="75" tone={tone} />}
      {children}
      {closable && (
        <button
          aria-label={closeLabel}
          className={cn(
            "-mr-0.5 inline-flex items-center justify-center rounded-full",
            "cursor-pointer opacity-70 transition-opacity duration-100 hover:opacity-100",
            focusRing,
          )}
          data-testid={ChipTestId.Close}
          // Removing a chip is a discrete action — don't let the click bubble to
          // an interactive ancestor (e.g. a multi-select trigger that opens a menu).
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          type="button"
        >
          <Icon name="x" size="xs" stroke="medium" />
        </button>
      )}
    </span>
  );
}
