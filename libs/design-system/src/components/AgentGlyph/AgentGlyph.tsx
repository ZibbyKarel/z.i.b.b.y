import type { CSSProperties, Ref } from "react";
import { type StateTone, stateToneVar } from "../../stateTone";
import { MinionBody } from "../Minion/MinionBody";
import { minionFigureWidth } from "../Minion/MinionFigure";
import { type MinionAppearance, minionAppearanceFromSeed } from "../Minion/minionAppearance";

/** The DS.md §7 sanctioned SVG sizes — no arbitrary px (sealed sizing). */
export type GlyphSize = 18 | 22 | 28 | 30 | 38 | 48 | 128;

export enum AgentGlyphTestId {
  Root = "agent-glyph-root",
}

export interface AgentGlyphProps {
  /** Deterministic identity seed (agent id/name) — the same seed always renders the
   *  same minion (width, height, eyes, hair, skin) unless `appearance` is given. */
  seed: string;
  /** Canonical state — drives the minion's pose, expression and per-state extras. */
  state: StateTone;
  /** Rendered height in px — the DS.md §7 sanctioned sizes only (sealed sizing). */
  size?: GlyphSize;
  /** Opt out of the ambient glow (only ever rendered dark-theme, `size >= 40` and
   *  non-`idle` — see `theme/globals.css`'s `--glyph-glow-filter`). On by default. */
  glow?: boolean;
  /** The employee's stored appearance; falls back to one derived from `seed`. */
  appearance?: MinionAppearance;
  ref?: Ref<SVGSVGElement>;
}

/**
 * The agent avatar — a Minion (see `components/Minion`). Deterministic per `seed`
 * unless an explicit `appearance` is supplied; the per-state pose and extras are the
 * one live read of an agent's `StateTone`. The glow is dark-theme-only (see
 * `--glyph-glow-filter` in `theme/globals.css`) and never rendered `idle`; the extras'
 * motion honours `prefers-reduced-motion` for free (the `mv-*` keyframes only exist
 * under `no-preference`).
 */
export function AgentGlyph({
  seed,
  state,
  size = 48,
  glow = true,
  appearance,
  ref,
}: AgentGlyphProps) {
  const tone = stateToneVar[state];
  const showGlow = glow && size >= 40 && state !== "idle";

  return (
    <svg
      data-seed={seed}
      data-state={state}
      data-testid={AgentGlyphTestId.Root}
      height={size}
      ref={ref}
      style={{
        display: "block",
        flexShrink: 0,
        overflow: "visible",
        ...(showGlow
          ? ({
              "--glyph-glow-color": `color-mix(in oklch, ${tone} 75%, transparent)`,
              filter: "var(--glyph-glow-filter, none)",
            } as CSSProperties)
          : { filter: "none" }),
      }}
      viewBox="0 0 100 120"
      width={minionFigureWidth(size)}
    >
      <MinionBody appearance={appearance ?? minionAppearanceFromSeed(seed)} state={state} />
    </svg>
  );
}
