import type { CSSProperties, Ref } from "react";
import { hashSeed, seededRandom } from "../../utils/seededRandom";
import { type StateTone, stateToneVar } from "../../stateTone";

/** The DS.md §7 sanctioned SVG sizes — no arbitrary px (sealed sizing). */
export type GlyphSize = 18 | 22 | 30 | 48 | 128;

export enum AgentGlyphTestId {
  Root = "agent-glyph-root",
}

type Row = [number, number, number, number, number, number, number, number];
type Grid = [Row, Row, Row, Row, Row, Row, Row, Row];
type Arm = readonly [number, number];
type EyePair = readonly [readonly [number, number], readonly [number, number]];

interface GlyphShape {
  g: Grid;
  arms: readonly Arm[];
  eyes: EyePair;
}

function emptyRow(): Row {
  return [0, 0, 0, 0, 0, 0, 0, 0];
}

function setCell(g: Grid, x: number, y: number, v: 0 | 1) {
  const row = g[y];
  if (row) row[x] = v;
}

/**
 * Deterministic 8×8, left-right-mirrored creature — ported verbatim (algorithm and
 * constants) from `design/ZibbyCorp/zibby.js`'s `shape()`. The same `seed` always
 * yields the same body/ear/arm/eye layout (DS.md §7).
 */
function buildShape(seed: string): GlyphShape {
  const r = seededRandom(seed);
  const g = [
    emptyRow(),
    emptyRow(),
    emptyRow(),
    emptyRow(),
    emptyRow(),
    emptyRow(),
    emptyRow(),
    emptyRow(),
  ] as Grid;
  const set = (x: number, y: number) => {
    if (y < 0 || y > 7) return;
    setCell(g, x, y, 1);
    setCell(g, 7 - x, y, 1);
  };

  const top = r() < 0.55 ? 1 : 2;
  const w = r() < 0.5 ? 3 : 2;
  const x0 = 4 - w;
  for (let y = top; y <= 6; y++) for (let x = x0; x <= 3; x++) set(x, y);
  if (r() < 0.5) {
    setCell(g, x0, top, 0);
    setCell(g, 7 - x0, top, 0);
  }

  const ear = Math.floor(r() * 4);
  if (ear === 0) set(x0, top - 1);
  else if (ear === 1) set(3, top - 1);
  else if (ear === 2) {
    set(x0, top - 1);
    set(x0, top - 2);
  }

  let arms: Arm[] = [];
  const ay = 4 + (r() < 0.5 ? 0 : 1);
  const ax = x0 - 1;
  if (r() < 0.8) {
    arms = [
      [ax, ay],
      [7 - ax, ay],
    ];
  } else if (w === 2) {
    for (let y = 3; y <= 5; y++) set(1, y);
  }
  set(x0, 7);
  if (r() < 0.5) set(3, 7);
  if (r() < 0.35) {
    setCell(g, 3, 6, 0);
    setCell(g, 4, 6, 0);
  }

  const ey = Math.min(top + 1 + (r() < 0.3 ? 1 : 0), 4);
  const ex = w === 3 ? (r() < 0.5 ? 1 : 2) : 2;
  return {
    g,
    arms,
    eyes: [
      [ex, ey],
      [7 - ex, ey],
    ],
  };
}

/** Per-seed stagger so identical states don't all animate in lockstep. */
function delayFor(hv: number, n: number): string {
  return `-${(((hv % 997) / 997) * n).toFixed(2)}s`;
}

const BODY_FILL = "var(--color-ink)";
const EYE_FILL = "var(--color-panel)";

/** States that blink the eyes (`zb-blink`) — awake but not actively erroring. */
const BLINKS: ReadonlySet<StateTone> = new Set(["idle", "working", "thinking"]);

/** The whole-body animation per state (DS.md §7 / `zibby.js`'s `anim` map). */
function wholeBodyAnimation(state: StateTone, hv: number): string | undefined {
  switch (state) {
    case "idle":
      return `zb-breathe 2.4s steps(1,end) ${delayFor(hv, 2.4)} infinite`;
    case "working":
      return `zb-bob .45s steps(1,end) ${delayFor(hv, 0.45)} infinite`;
    case "thinking":
      return `zb-breathe 3.2s steps(1,end) ${delayFor(hv, 3.2)} infinite`;
    case "blocked":
      return "none";
    case "error":
      return "zb-shake .32s steps(1,end) infinite";
    case "done":
      return `zb-hop 1.4s steps(1,end) ${delayFor(hv, 1.4)} infinite`;
  }
}

interface PixelSpec {
  key: string;
  x: number;
  y: number;
  fill: string;
  style?: CSSProperties;
}

/** State-specific "extras" outside the 8×8 body — working dots, thinking dots,
 *  blocked marks, error sparks, done sparkles (DS.md §7 / `zibby.js`'s `ex`). */
function stateExtras(state: StateTone, tone: string): PixelSpec[] {
  switch (state) {
    case "working":
      return Array.from({ length: 6 }, (_, i) => ({
        key: `k${i}`,
        x: 3 + i,
        y: 11,
        fill: tone,
        style: { animation: `zb-key .5s steps(1,end) ${((i * 7) % 5) * 0.1}s infinite` },
      }));
    case "thinking":
      return [7, 9, 11].map((x, i) => ({
        key: `t${i}`,
        x,
        y: 0,
        fill: tone,
        style: { animation: `zb-dot 1.2s ease-in-out ${i * 0.2}s infinite` },
      }));
    case "blocked":
      return [1, 2, 3, 5].map((y) => ({
        key: `x${y}`,
        x: 11,
        y,
        fill: tone,
        style: { animation: "zb-pulse 1s steps(1,end) infinite" },
      }));
    case "error":
      return (
        [
          [0, 1],
          [11, 3],
          [1, 11],
          [10, 10],
        ] as const
      ).map(([x, y], i) => ({
        key: `r${i}`,
        x,
        y,
        fill: tone,
        style: { animation: `zb-twinkle .5s steps(1,end) ${i * 0.12}s infinite` },
      }));
    case "done":
      return (
        [
          [0, 1],
          [11, 0],
          [0, 9],
          [11, 8],
          [6, 0],
        ] as const
      ).map(([x, y], i) => ({
        key: `s${i}`,
        x,
        y,
        fill: tone,
        style: { animation: `zb-twinkle 1.4s steps(1,end) ${i * 0.28}s infinite` },
      }));
    case "idle":
      return [];
  }
}

function Pixel({
  x,
  y,
  fill,
  style,
}: {
  x: number;
  y: number;
  fill: string;
  style?: CSSProperties;
}) {
  return <rect height={1.04} style={{ fill, ...style }} width={1.04} x={x} y={y} />;
}

export interface AgentGlyphProps {
  /** Deterministic identity seed (agent id/name) — the same seed always renders the
   *  same creature (body/ear/arm/eye layout), ported verbatim from `zibby.js`. */
  seed: string;
  /** Canonical state — drives the whole-body animation, eye colour/blink, and the
   *  per-state extras (working dots, thinking dots, blocked marks, error sparks,
   *  done sparkles). */
  state: StateTone;
  /** SVG px size — the DS.md §7 sanctioned sizes only (sealed sizing). */
  size?: GlyphSize;
  /** Opt out of the ambient glow (only ever rendered dark-theme, `size >= 40` and
   *  non-`idle` — see `theme/globals.css`'s `--glyph-glow-filter`). On by default. */
  glow?: boolean;
  ref?: Ref<SVGSVGElement>;
}

/**
 * The procedural 12×12 mirrored agent avatar — DS.md §7, ported verbatim from
 * `design/ZibbyCorp/zibby.js`. Deterministic per `seed`; the per-state stepped
 * animation and "extras" are the one live read of an agent's `StateTone`. The glow
 * is dark-theme-only (see `--glyph-glow-filter` in `theme/globals.css`) and never
 * rendered `idle`; all motion honours `prefers-reduced-motion` for free (the
 * `zb-*` keyframes only exist under `no-preference` — an unresolved `animation-name`
 * is a no-op per the CSS Animations spec).
 */
export function AgentGlyph({ seed, state, size = 48, glow = true, ref }: AgentGlyphProps) {
  const shape = buildShape(seed);
  const hv = hashSeed(seed);
  const tone = stateToneVar[state];
  const showGlow = glow && size >= 40 && state !== "idle";

  const bodyPixels = shape.g.flatMap((row, y) =>
    row.flatMap((v, x) => (v ? [{ key: `b${x}_${y}`, x: x + 2, y: y + 2 }] : [])),
  );

  const eyeFill = state === "error" ? tone : EYE_FILL;
  const blink = BLINKS.has(state);

  const extras = stateExtras(state, tone);

  return (
    <svg
      data-seed={seed}
      data-state={state}
      data-testid={AgentGlyphTestId.Root}
      height={size}
      ref={ref}
      shapeRendering="crispEdges"
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
      viewBox="0 0 12 12"
      width={size}
    >
      <g style={{ animation: wholeBodyAnimation(state, hv) }}>
        {bodyPixels.map(({ key, x, y }) => (
          <Pixel fill={BODY_FILL} key={key} x={x} y={y} />
        ))}
        {shape.arms.map(([x, y], i) => (
          <g
            key={`a${i}`}
            style={
              state === "working"
                ? { animation: `zb-arm .45s steps(1,end) ${i ? ".22s" : "0s"} infinite` }
                : undefined
            }
          >
            <Pixel fill={BODY_FILL} x={x + 2} y={y + 2} />
          </g>
        ))}
        <g
          style={
            blink
              ? {
                  animation: `zb-blink 3.8s ${delayFor(hv, 3.8)} infinite`,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                }
              : undefined
          }
        >
          {shape.eyes.map(([x, y], i) => (
            <Pixel fill={eyeFill} key={`e${i}`} x={x + 2} y={y + 2} />
          ))}
        </g>
      </g>
      {extras.map(({ key, x, y, fill, style }) => (
        <Pixel fill={fill} key={key} style={style} x={x} y={y} />
      ))}
    </svg>
  );
}
