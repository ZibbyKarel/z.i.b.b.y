import type { Ref } from "react";
import { type StateTone, stateToneVar } from "../../stateTone";
import { MinionBody } from "../Minion/MinionBody";
import { minionFigureWidth } from "../Minion/MinionFigure";
import { ZIBBY_APPEARANCE } from "../Minion/minionAppearance";

/** The sanctioned render sizes (sealed sizing) — 16 is the favicon grid 1:1,
 *  112 the org-map hero (`design/ZibbyCorp/Org Screens.dc.html`),
 *  128 / 200 the org-map floorplan lobby. */
export type ZibbyAvatarSize = 16 | 24 | 32 | 38 | 64 | 112 | 128 | 200;

export enum ZibbyAvatarTestId {
  Root = "zibby-avatar-root",
  Accent = "zibby-avatar-accent",
}

/**
 * Legacy variant 1b "HUB" pixel map (`design/ZibbyCorp/Zibby Avatar.dc.html`) — three antenna
 * nodes join into one head (the org tree feeding its COO); the mouth is a progress
 * bar carrying the live state. No longer rendered (Zibby is a Minion now); kept
 * exported for the favicon tooling until it is cleaned up. Left halves, mirrored into a 16-wide row.
 * `#` body · `o` eye · `s` state accent.
 */
const HALF_ROWS = [
  "..s....s",
  "..#....#",
  "..######",
  "....####",
  "..######",
  ".#######",
  ".##oo###",
  ".##oo###",
  ".#######",
  ".###ssss",
  ".#######",
  "..######",
  "..#....#",
] as const;

/** The full 16×16 pixel map (13 rows, offset one row down) — also the source the
 *  favicon assets in `apps/web/app` are rendered from. */
export const ZIBBY_AVATAR_ROWS: readonly string[] = HALF_ROWS.map(
  (r) => r + r.split("").reverse().join(""),
);

export interface ZibbyAvatarProps {
  /** The live state of the whole system — tints the goggles and drives the motion. */
  state: StateTone;
  /** SVG px size — sanctioned sizes only (sealed sizing). */
  size?: ZibbyAvatarSize;
  /** Turn the per-state motion off (e.g. the static top-bar logo). On by default. */
  animate?: boolean;
  /** Accessible name + hover tooltip; the avatar is decorative (`aria-hidden`) without one. */
  label?: string;
  ref?: Ref<SVGSVGElement>;
}

/**
 * Zibby, the COO — a Minion (design `ZBASE` + `Z2[1]` "glow goggles"): moustache, tie,
 * and goggles that glow in the live `StateTone`. Motion is CSS keyframes only, so
 * `prefers-reduced-motion` stops it for free (see `theme/globals.css`).
 */
export function ZibbyAvatar({ state, size = 32, animate = true, label, ref }: ZibbyAvatarProps) {
  const tone = stateToneVar[state];
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      data-state={state}
      data-testid={ZibbyAvatarTestId.Root}
      height={size}
      ref={ref}
      role={label ? "img" : undefined}
      style={{ display: "block", flexShrink: 0, overflow: "visible" }}
      viewBox="0 0 100 120"
      width={minionFigureWidth(size)}
    >
      {label ? <title>{label}</title> : null}
      <g data-testid={ZibbyAvatarTestId.Accent} style={{ color: tone }}>
        <MinionBody lens stache animate={animate} appearance={ZIBBY_APPEARANCE} state={state} />
      </g>
    </svg>
  );
}
