import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
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
}

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  tone?: ChipTone;
  /** Show a leading status dot. */
  dot?: boolean;
  /** Live — the dot glows and pulses (only meaningful with `dot`). */
  pulse?: boolean;
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
  children,
  ref,
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-[3px]",
        dot ? "pl-2 pr-2.5" : "px-2.5",
        "font-mono text-xs whitespace-nowrap",
        toneClass[tone],
      )}
      data-testid={ChipTestId.Root}
      ref={ref}
      {...props}
    >
      {dot && <StatusDot data-testid={ChipTestId.Dot} pulse={pulse} size="75" tone={tone} />}
      {children}
    </span>
  );
}
