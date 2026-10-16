import type { Ref } from "react";
import type { StateTone } from "../../stateTone";
import { MinionBody } from "./MinionBody";
import type { MinionAppearance } from "./minionAppearance";

/** Sanctioned minion render heights (sealed sizing) — the union of the avatar sizes. */
export type MinionSize =
  | 16
  | 18
  | 22
  | 24
  | 28
  | 30
  | 32
  | 38
  | 48
  | 56
  | 64
  | 72
  | 96
  | 112
  | 128
  | 160
  | 200;

export enum MinionFigureTestId {
  Root = "minion-figure-root",
}

/** Rendered width of a figure of the given height (design `vsvg`: `round(size * 100 / 120)`). */
export function minionFigureWidth(size: number): number {
  return Math.round((size * 100) / 120);
}

export interface MinionFigureProps {
  appearance: MinionAppearance;
  state?: StateTone;
  /** Rendered height in px; width follows the `100 x 120` viewBox. */
  size?: MinionSize;
  /** Zibby moustache. */
  stache?: boolean;
  /** Glowing goggles in the state colour. */
  lens?: boolean;
  /** Turn the per-state CSS motion off. On by default. */
  animate?: boolean;
  /** Accessible name; the figure is decorative (`aria-hidden`) without one. */
  label?: string;
  ref?: Ref<SVGSVGElement>;
}

/**
 * A static minion with its per-state extras (thinking bubbles, blocked "!", error
 * mini-explosion, done check + confetti, idle zzz). Port of the design's `vsvg(vMinion())`.
 * Motion is CSS keyframes only, so `prefers-reduced-motion` stops it for free.
 */
export function MinionFigure({
  appearance,
  state = "idle",
  size = 48,
  stache = false,
  lens = false,
  animate = true,
  label,
  ref,
}: MinionFigureProps) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      data-state={state}
      data-testid={MinionFigureTestId.Root}
      height={size}
      ref={ref}
      role={label ? "img" : undefined}
      style={{ display: "block", overflow: "visible", flexShrink: 0 }}
      viewBox="0 0 100 120"
      width={minionFigureWidth(size)}
    >
      {label ? <title>{label}</title> : null}
      <MinionBody
        animate={animate}
        appearance={appearance}
        lens={lens}
        stache={stache}
        state={state}
      />
    </svg>
  );
}
