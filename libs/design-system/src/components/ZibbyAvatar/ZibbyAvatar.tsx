import type { Ref } from "react";
import { type StateTone, stateToneVar } from "../../stateTone";

/** The sanctioned render sizes (sealed sizing) — 16 is the favicon grid 1:1,
 *  112 the org-map hero (`design/ZibbyCorp/Org Screens.dc.html`). */
export type ZibbyAvatarSize = 16 | 24 | 32 | 112;

export enum ZibbyAvatarTestId {
  Root = "zibby-avatar-root",
  Accent = "zibby-avatar-accent",
}

/**
 * Variant 1b "HUB" from `design/ZibbyCorp/Zibby Avatar.dc.html` — three antenna
 * nodes join into one head (the org tree feeding its COO); the mouth is a progress
 * bar carrying the live state. Left halves, mirrored into a 16-wide row.
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
const ROW_OFFSET = 1;

interface Cell {
  key: string;
  x: number;
  y: number;
}

function cellsOf(ch: string): Cell[] {
  return ZIBBY_AVATAR_ROWS.flatMap((row, y) =>
    [...row].flatMap((c, x) =>
      c === ch ? [{ key: `${ch}${x}_${y}`, x, y: y + ROW_OFFSET }] : [],
    ),
  );
}

const BODY = cellsOf("#");
const EYES = cellsOf("o");
const ACCENT = cellsOf("s");

const BODY_ANIMATION: Record<StateTone, string> = {
  working: "av-bob .5s steps(1,end) infinite",
  thinking: "av-bob 2.4s steps(1,end) infinite",
  idle: "av-bob 3s steps(1,end) infinite",
  done: "av-hop 1.6s steps(1,end) infinite",
  error: "av-shake .32s steps(1,end) infinite",
  blocked: "none",
};

const ACCENT_ANIMATION: Record<StateTone, string> = {
  working: "zb-live 1.4s ease-in-out infinite",
  thinking: "av-think 1.2s ease-in-out infinite",
  blocked: "zb-pulse 1s steps(1,end) infinite",
  error: "zb-pulse .4s steps(1,end) infinite",
  done: "none",
  idle: "none",
};

const BLINKS: ReadonlySet<StateTone> = new Set(["working", "thinking", "idle"]);

function Pixels({ cells }: { cells: Cell[] }) {
  return cells.map(({ key, x, y }) => (
    <rect height={1.02} key={key} width={1.02} x={x} y={y} />
  ));
}

export interface ZibbyAvatarProps {
  /** The live state of the whole system — tints the mouth bar and drives the motion. */
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
 * Zibby, the COO — the system mark (`design/ZibbyCorp/Zibby Avatar.dc.html`, variant
 * 1b). A fixed 16×16 pixel character, unlike the seeded `AgentGlyph`: ink body, paper
 * eyes, one accent pixel group carrying the live `StateTone`. Motion honours
 * `prefers-reduced-motion` for free — the `av-*`/`zb-*` keyframes only exist under
 * `no-preference` (see `theme/globals.css`).
 */
export function ZibbyAvatar({ state, size = 32, animate = true, label, ref }: ZibbyAvatarProps) {
  const tone = stateToneVar[state];
  const blink = animate && BLINKS.has(state);

  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      data-state={state}
      data-testid={ZibbyAvatarTestId.Root}
      height={size}
      ref={ref}
      role={label ? "img" : undefined}
      shapeRendering="crispEdges"
      style={{ display: "block", flexShrink: 0, overflow: "visible" }}
      viewBox="0 0 16 16"
      width={size}
    >
      {label ? <title>{label}</title> : null}
      <g style={{ animation: animate ? BODY_ANIMATION[state] : "none" }}>
        <g style={{ fill: "var(--color-ink)" }}>
          <Pixels cells={BODY} />
        </g>
        <g
          style={{
            fill: state === "error" ? tone : "var(--color-panel)",
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: blink ? "av-blink 4s infinite" : "none",
          }}
        >
          <Pixels cells={EYES} />
        </g>
        <g
          data-testid={ZibbyAvatarTestId.Accent}
          style={{ fill: tone, animation: animate ? ACCENT_ANIMATION[state] : "none" }}
        >
          <Pixels cells={ACCENT} />
        </g>
      </g>
    </svg>
  );
}
