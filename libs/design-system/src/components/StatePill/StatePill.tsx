import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { STATE_LABEL, type StateTone, stateToneVar } from "../../stateTone";
import { cn } from "../../utils/cn";
import { Typography } from "../Typography/Typography";

export interface StateDotProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  state: StateTone;
  /** Px side of the square dot — DS.md §7's 7–9px range (`StatePill` uses 8,
   *  `CellStrip` uses the spec's 9). Not a sealed-sizing prop: an internal detail
   *  of the two DS.md §7 dot consumers, not a general-purpose size knob. */
  px: number;
  className?: string;
}

/**
 * The shared "square dot filled with the status colour" primitive (DS.md §7's
 * status dot, `zibby.js`'s `dot()`) — `StatePill`'s leading dot and each cell of
 * `CellStrip` are the same mark at two different sizes. Working dots breathe
 * (`zb-live`), blocked dots blink (`zb-pulse`); every other state is static.
 * Not part of the public DS surface (not exported from `index.ts`) — reached only
 * via `StatePill`/`CellStrip`.
 */
export function StateDot({ state, px, className, style, ...rest }: StateDotProps) {
  const color = stateToneVar[state];
  const animation =
    state === "working"
      ? "zb-live 1.4s ease-in-out infinite"
      : state === "blocked"
        ? "zb-pulse 1s steps(1,end) infinite"
        : "none";
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
      style={{
        animation,
        background: color,
        borderRadius: "var(--dot-r, 0px)",
        boxShadow: `0 0 var(--gw) ${color}`,
        height: px,
        width: px,
        ...style,
      }}
      {...rest}
    />
  );
}

export enum StatePillTestId {
  Root = "state-pill-root",
  Dot = "state-pill-dot",
  Label = "state-pill-label",
}

export interface StatePillProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  state: StateTone;
  /** Overrides the default English state label ({@link STATE_LABEL}). */
  label?: string;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * A square status dot + mono-uppercase label (DS.md §7/§3.2) — the compact
 * "state, named" chip the HUD/Chat-UI reach for wherever a `Tag`/`Chip` is too
 * heavy (a list row, a card's meta line). The label defaults to the canonical
 * English state name and is overridable (localized copy, a task-specific phrase).
 */
export function StatePill({ state, label, ref, ...props }: StatePillProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      data-testid={StatePillTestId.Root}
      ref={ref}
      {...props}
    >
      <StateDot data-testid={StatePillTestId.Dot} px={8} state={state} />
      <Typography
        as="span"
        data-testid={StatePillTestId.Label}
        style={{ color: stateToneVar[state] as CSSProperties["color"] }}
        type="label"
      >
        {label ?? STATE_LABEL[state]}
      </Typography>
    </span>
  );
}
