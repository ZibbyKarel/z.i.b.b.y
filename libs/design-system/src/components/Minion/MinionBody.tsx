import { type ReactNode, useId } from "react";
import { type StateTone, stateToneVar } from "../../stateTone";
import type { MinionAppearance } from "./minionAppearance";
import { type MinionGeometry, minionGeometry } from "./minionGeometry";
import {
  MINION_DENIM,
  MINION_DENIM_DARK,
  MINION_K,
  MINION_METAL,
  MINION_METAL_DARK,
  MINION_MUTED,
  MINION_PANEL,
  MINION_PAPER,
  MINION_SCREEN,
  MINION_SHADE,
  MINION_SKIN,
  MINION_SOOT,
  MINION_WHITE,
} from "./minionPalette";
import { At, cssAnim } from "./minionSmil";

const K = MINION_K;

/** Mouth override — `none` draws no mouth at all (the sleeping idle scene). */
export type MinionMouthState = StateTone | "none";

const DEFAULT_LOOK: Record<StateTone, readonly [number, number]> = {
  working: [0, 2.5],
  thinking: [3, -3.5],
  blocked: [0, 0],
  error: [0, 0],
  done: [0, 0],
  idle: [0, 0],
};

export interface MinionArmProps {
  sx: number;
  sy: number;
  hx: number;
  hy: number;
  /** Sideways bend of the arm's control point. */
  out: number;
  skin: string;
}

/** Port of the design's `arm()` — outlined noodle arm ending in a black glove. */
export function MinionArm({ sx, sy, hx, hy, out, skin }: MinionArmProps) {
  const d = `M${sx} ${sy} Q${sx + out} ${(sy + hy) / 2} ${hx} ${hy}`;
  return (
    <>
      <path d={d} fill="none" stroke={K} strokeLinecap="round" strokeWidth={8} />
      <path d={d} fill="none" stroke={skin} strokeLinecap="round" strokeWidth={4.6} />
      <circle cx={hx} cy={hy} fill={K} r={4.8} />
    </>
  );
}

interface ExtrasProps {
  state: StateTone;
  x: number;
  y: number;
  w: number;
  animate: boolean;
}

/** Port of the design's `extras()` — the per-state decoration around the figure. */
function MinionExtras({ state, x, y, w, animate }: ExtrasProps) {
  const S = stateToneVar[state];
  if (state === "thinking") {
    const dots: readonly (readonly [number, number, number])[] = [
      [x + w + 3, y + 4, 2.2],
      [x + w + 9, y - 3, 3.2],
      [x + w + 17, y - 12, 4.6],
    ];
    return dots.map(([a, b, r], i) => (
      <circle
        cx={a}
        cy={b}
        key={`t${a}`}
        r={r}
        style={{ fill: S, ...cssAnim(animate, `mv-pulse 1.4s ${i * 0.25}s ease-in-out infinite`) }}
      />
    ));
  }
  if (state === "blocked") {
    return (
      <g style={cssAnim(animate, "mv-blink 1s steps(1,end) infinite")}>
        <circle cx={x + w + 16} cy={y - 10} r={9} strokeWidth={2} style={{ fill: S, stroke: K }} />
        <rect fill={MINION_WHITE} height={7.5} rx={1.2} width={2.8} x={x + w + 14.6} y={y - 16} />
        <circle cx={x + w + 16} cy={y - 5.6} fill={MINION_WHITE} r={1.6} />
      </g>
    );
  }
  if (state === "error") {
    const mx = x + w / 2;
    const mb = y + 1;
    const star = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const rr = i % 2 ? 9 : 19;
      return `${(mx + Math.cos(a) * rr).toFixed(1)},${(mb - 16 + Math.sin(a) * rr * 0.8).toFixed(1)}`;
    }).join(" ");
    const puffs: readonly (readonly [number, number, number])[] = [
      [-8, -17, 6],
      [8, -17, 6],
      [-4, -22, 7],
      [4, -22, 7],
      [0, -17, 7],
    ];
    const soot: readonly (readonly [number, number, number])[] = [
      [x + w * 0.22, y + 13, 2.2],
      [x + w * 0.74, y + 10, 1.8],
    ];
    return (
      <>
        <polygon
          fillOpacity={0.4}
          points={star}
          style={{ fill: S, ...cssAnim(animate, "mv-blink .5s steps(1,end) infinite") }}
        />
        <path
          d={`M${mx - 3.5} ${mb} Q${mx - 2} ${mb - 7} ${mx - 3} ${mb - 13} H${mx + 3} Q${mx + 2} ${mb - 7} ${mx + 3.5} ${mb} Z`}
          fill={MINION_PANEL}
          stroke={K}
          strokeWidth={1.8}
        />
        <ellipse cx={mx} cy={mb - 8} fill="#BFC2BC" rx={7} ry={2.2} stroke={K} strokeWidth={1.6} />
        <g style={cssAnim(animate, "mv-boom 1.2s ease-in-out infinite", `${mx}px ${mb - 18}px`)}>
          {puffs.map(([dx, dy, r]) => (
            <circle
              cx={mx + dx}
              cy={mb + dy}
              fill={MINION_PANEL}
              key={`${dx}_${dy}`}
              r={r}
              stroke={K}
              strokeWidth={1.8}
            />
          ))}
          <path
            d={`M${mx - 12} ${mb - 15} Q${mx} ${mb - 10} ${mx + 12} ${mb - 15}`}
            fill="none"
            strokeLinecap="round"
            strokeWidth={2.4}
            style={{ stroke: S }}
          />
          <circle cx={mx} cy={mb - 19} r={3} style={{ fill: S }} />
        </g>
        {soot.map(([a, b, r]) => (
          <circle cx={a} cy={b} fill={MINION_SOOT} key={`soot${a}`} r={r} />
        ))}
      </>
    );
  }
  if (state === "done") {
    const confetti: readonly (readonly [number, number, string])[] = [
      [x + w + 6, y - 4, S],
      [x + w + 14, y + 4, K],
      [x + w + 2, y - 14, K],
      [x + w + 12, y - 12, S],
    ];
    return (
      <>
        <g>
          <circle cx={x - 12} cy={y - 6} r={9} strokeWidth={2} style={{ fill: S, stroke: K }} />
          <path
            d={`M${x - 16} ${y - 6} l3 3 6 -6`}
            fill="none"
            stroke={MINION_WHITE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.6}
          />
        </g>
        {confetti.map(([a, b, c], i) => (
          <rect
            height={3.5}
            key={`c${a}_${b}`}
            style={{ fill: c }}
            transform={`rotate(${i * 30} ${a} ${b})`}
            width={3.5}
            x={a}
            y={b}
          />
        ))}
      </>
    );
  }
  if (state === "idle") {
    const zs: readonly (readonly [number, number, number])[] = [
      [x + w + 4, y + 6, 9],
      [x + w + 12, y - 4, 12],
    ];
    return zs.map(([a, b, s], i) => (
      <text
        fontSize={s}
        fontWeight={600}
        key={`z${a}`}
        style={{
          fill: MINION_MUTED,
          fontFamily: "var(--font-mono, 'Geist Mono', monospace)",
          ...cssAnim(animate, `mv-pulse 2.4s ${i * 0.6}s ease-in-out infinite`),
        }}
        x={a}
        y={b}
      >
        z
      </text>
    ));
  }
  return null;
}

type Point3 = readonly [number, number, number];

/** Arm hand targets per state (design `P`): `[x, y, out]` for the left then right arm. */
function armTargets(state: StateTone, g: MinionGeometry): readonly [Point3, Point3] {
  const { x, w, cx, ovTop, my, y, eyeY } = g;
  switch (state) {
    case "idle":
      return [
        [x - 5, ovTop + 9, -6],
        [x + w + 5, ovTop + 9, 6],
      ];
    case "working":
      return [
        [cx - 15, ovTop + 1, -10],
        [cx + 15, ovTop + 1, 10],
      ];
    case "thinking":
      return [
        [x - 5, ovTop + 9, -6],
        [cx + 6, my + 5, 14],
      ];
    case "blocked":
      return [
        [x - 5, ovTop + 9, -6],
        [x + w + 9, y + 2, 10],
      ];
    case "error":
      return [
        [x - 3, eyeY - 12, -12],
        [x + w + 3, eyeY - 12, 12],
      ];
    case "done":
      return [
        [x - 12, y + 2, -4],
        [x + w + 12, y + 2, 4],
      ];
  }
}

function hairPath(hair: MinionAppearance["hair"], cx: number, y: number): string {
  switch (hair) {
    case "tuft":
      return `M${cx} ${y + 1} q-2 -8 -7 -10 M${cx} ${y + 1} q1 -9 6 -11 M${cx} ${y + 1} q0 -6 -1 -10`;
    case "spikes":
      return [-9, -3, 3, 9]
        .map((d) => `M${cx + d} ${y + 1.5 + Math.abs(d) * 0.25} l${d * 0.25} -8`)
        .join(" ");
    case "sprout":
      return `M${cx} ${y + 1} q3 -10 9 -12`;
    case "strands":
      return `M${cx - 6} ${y + 1.5} q-3 -6 0 -10 M${cx} ${y + 0.5} q3 -6 0 -11 M${cx + 6} ${y + 1.5} q3 -6 0 -10`;
  }
}

export interface MinionBodyProps {
  appearance: MinionAppearance;
  state?: StateTone;
  /** Horizontal centre (default 50). */
  cx?: number;
  /** Ground line y (default 104). */
  gy?: number;
  /** Override which state the eyes show. */
  eyeSt?: StateTone;
  /** Override which state the mouth shows (`none` = no mouth). */
  mouthSt?: MinionMouthState;
  /** Pupil offset `[dx, dy]` (default per eye state). */
  look?: readonly [number, number];
  noArms?: boolean;
  noExtras?: boolean;
  noFloor?: boolean;
  /** SMIL step duration — makes the legs march (e.g. `.5s`). */
  march?: string;
  /** SMIL `begin` for the march. */
  begin?: string;
  /** Zibby moustache. */
  stache?: boolean;
  /** Goggles glow in the state colour (Zibby's glow goggles). */
  lens?: boolean;
  /** Turn the CSS-keyframe decoration off (static render). On by default. */
  animate?: boolean;
}

/**
 * Port of the design's `vMinion()` — the minion body in a `100 x 120`-style viewBox.
 * Returns SVG children (no `<svg>`), so scenes and walkers can nest it inside their own
 * groups/transforms. The art uses the fixed minion palette (see `minionPalette.ts`);
 * only the state-tinted parts read the DS state-tone vars.
 */
export function MinionBody({
  appearance,
  state = "working",
  cx = 50,
  gy = 104,
  eyeSt,
  mouthSt,
  look,
  noArms = false,
  noExtras = false,
  noFloor = false,
  march,
  begin,
  stache = false,
  lens = false,
  animate = true,
}: MinionBodyProps) {
  const rawId = useId();
  const clipId = `minion-clip-${rawId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const g = minionGeometry({ appearance, cx, gy });
  const { w, H, x, y, eyeR, eyeY, my, ovTop, bibTop } = g;
  const r = w / 2;
  const S = stateToneVar[state];
  const skin = MINION_SKIN[appearance.skin];
  const suit = MINION_DENIM;
  const suit2 = MINION_DENIM_DARK;
  const hat = appearance.hat;
  const two = appearance.eyes === 2;
  const est = eyeSt ?? state;
  const mst: MinionMouthState = mouthSt ?? state;
  const [lookX, lookY] = look ?? DEFAULT_LOOK[est];
  const hasBib = bibTop < ovTop - 2;
  const exs = two ? [cx - eyeR - 0.5, cx + eyeR + 0.5] : [cx];
  const ri = eyeR - 3.6;

  const leg = (s: 0 | 1) => (
    <>
      <rect
        fill={suit}
        height={8}
        stroke={K}
        strokeWidth={2}
        width={8}
        x={s ? cx + 4 : cx - 12}
        y={gy - 3}
      />
      <ellipse cx={s ? cx + 10 : cx - 10} cy={gy + 6} fill={K} rx={7.5} ry={3.8} />
    </>
  );

  let mouth: ReactNode = null;
  if (mst === "thinking") {
    mouth = <ellipse cx={cx + 3} cy={my + 1} fill={K} rx={2.2} ry={2.6} />;
  } else if (mst === "done") {
    mouth = (
      <>
        <path d={`M${cx - 8} ${my - 1} Q${cx} ${my + 10} ${cx + 8} ${my - 1} Z`} fill={K} />
        <path d={`M${cx - 6} ${my} H${cx + 6} V${my + 1.8} H${cx - 6} Z`} fill={MINION_WHITE} />
      </>
    );
  } else if (mst !== "none") {
    const d = {
      working: `M${cx - 5} ${my} Q${cx} ${my + 3} ${cx + 5} ${my}`,
      blocked: `M${cx - 5} ${my + 1} L${cx + 5} ${my + 1}`,
      error: `M${cx - 7} ${my + 1} l3.5 -2.5 3.5 2.5 3.5 -2.5 3.5 2.5`,
      idle: `M${cx - 3} ${my} Q${cx} ${my + 2} ${cx + 3} ${my}`,
    }[mst];
    mouth = (
      <path
        d={d}
        fill="none"
        stroke={K}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
    );
  }

  const targets = armTargets(state, g);

  return (
    <>
      {!noFloor ? (
        <ellipse
          cx={cx}
          cy={gy + 9}
          fillOpacity={0.33}
          rx={w * 0.78}
          ry={4.5}
          style={{ fill: S }}
        />
      ) : null}
      {march ? (
        [0, 1].map((s) => (
          <g key={`lg${s}`}>
            {leg(s === 0 ? 0 : 1)}
            <At
              begin={begin}
              dur={march}
              type="translate"
              values={s ? "0 0;0 0;0 0;0 -4;0 0" : "0 0;0 -4;0 0;0 0;0 0"}
            />
          </g>
        ))
      ) : (
        <>
          {leg(0)}
          {leg(1)}
        </>
      )}
      <defs>
        <clipPath id={clipId}>
          <rect height={H} rx={r} width={w} x={x} y={y} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect fill={skin} height={H} width={w} x={x} y={y} />
        <rect fill={MINION_SHADE} height={H} width={w * 0.38} x={x + w * 0.62} y={y} />
        <rect fill={suit} height={H} width={w} x={x} y={ovTop} />
        <rect fill={K} height={7} width={w} x={x} y={eyeY - 3.5} />
      </g>
      <rect fill="none" height={H} rx={r} stroke={K} strokeWidth={2.6} width={w} x={x} y={y} />
      {hasBib ? (
        <>
          <rect
            fill={suit}
            height={ovTop - bibTop + 2}
            width={w * 0.6}
            x={cx - w * 0.3}
            y={bibTop}
          />
          <path
            d={`M${cx - w * 0.3} ${ovTop} V${bibTop} H${cx + w * 0.3} V${ovTop}`}
            fill="none"
            stroke={K}
            strokeWidth={1.6}
          />
          <line
            stroke={suit}
            strokeWidth={3.5}
            x1={cx - w * 0.3}
            x2={x + 1.5}
            y1={bibTop + 1}
            y2={bibTop - 7}
          />
          <line
            stroke={suit}
            strokeWidth={3.5}
            x1={cx + w * 0.3}
            x2={x + w - 1.5}
            y1={bibTop + 1}
            y2={bibTop - 7}
          />
          <rect
            fill={suit2}
            height={6}
            rx={1.5}
            width={10}
            x={cx - 5}
            y={bibTop + (ovTop - bibTop) * 0.35}
          />
        </>
      ) : null}
      <line stroke={K} strokeWidth={1.6} x1={x + 1} x2={x + w - 1} y1={ovTop} y2={ovTop} />
      {exs.map((ex) => (
        <g key={`goggle${ex}`}>
          <circle
            cx={ex}
            cy={eyeY}
            r={eyeR}
            strokeWidth={2.4}
            style={{ fill: lens ? S : MINION_METAL, stroke: K }}
          />
          <circle cx={ex} cy={eyeY} fill={MINION_WHITE} r={ri} stroke={K} strokeWidth={1.4} />
          {lens ? (
            <circle
              cx={ex}
              cy={eyeY}
              fillOpacity={0.4}
              r={ri}
              style={{ fill: S, ...cssAnim(animate, "mv-pulse 2s ease-in-out infinite") }}
            />
          ) : null}
          {est === "done" ? (
            <path
              d={`M${ex - ri * 0.55} ${eyeY + 1.5} Q${ex} ${eyeY - ri * 0.7} ${ex + ri * 0.55} ${eyeY + 1.5}`}
              fill="none"
              stroke={K}
              strokeLinecap="round"
              strokeWidth={2.4}
            />
          ) : est === "idle" ? (
            <>
              <path
                d={`M${ex - ri} ${eyeY} A${ri} ${ri} 0 0 1 ${ex + ri} ${eyeY} Z`}
                fill={skin}
                stroke={K}
                strokeWidth={1.4}
              />
              <line
                stroke={K}
                strokeLinecap="round"
                strokeWidth={2}
                x1={ex - ri * 0.6}
                x2={ex + ri * 0.6}
                y1={eyeY + 1.5}
                y2={eyeY + 1.5}
              />
            </>
          ) : est === "error" ? (
            <path
              d={`M${ex - ri * 0.45} ${eyeY - ri * 0.45} L${ex + ri * 0.45} ${eyeY + ri * 0.45} M${ex + ri * 0.45} ${eyeY - ri * 0.45} L${ex - ri * 0.45} ${eyeY + ri * 0.45}`}
              fill="none"
              stroke={K}
              strokeLinecap="round"
              strokeWidth={2.4}
            />
          ) : (
            <>
              <circle
                cx={ex + (lookX * ri) / 8}
                cy={eyeY + (lookY * ri) / 8}
                fill={K}
                r={Math.max(2.6, ri * 0.36)}
              />
              <circle
                cx={ex + (lookX * ri) / 8 - Math.max(2.6, ri * 0.36) * 0.35}
                cy={eyeY + (lookY * ri) / 8 - Math.max(2.6, ri * 0.36) * 0.35}
                fill={MINION_WHITE}
                r={Math.max(2.6, ri * 0.36) * 0.3}
              />
              {est === "blocked" ? (
                <path
                  d={`M${ex - ri} ${eyeY - 0.5} A${ri} ${ri} 0 0 1 ${ex + ri} ${eyeY - 0.5} Z`}
                  fill={skin}
                  stroke={K}
                  strokeWidth={1.4}
                />
              ) : null}
            </>
          )}
        </g>
      ))}
      {mouth}
      {stache ? (
        <path
          d={`M${cx} ${my - 3.5} q-5 -4 -10 -.5 q-2 1.5 -4 1 q3 4.5 8 2.5 q4 -1 6 -3 q2 2 6 3 q5 2 8 -2.5 q-2 .5 -4 -1 q-5 -3.5 -10 .5 z`}
          fill={K}
        />
      ) : null}
      {!hat ? (
        <path
          d={hairPath(appearance.hair, cx, y)}
          fill="none"
          stroke={K}
          strokeLinecap="round"
          strokeWidth={2}
        />
      ) : null}
      {hat === "headphones" ? (
        <>
          <path
            d={`M${x - 1} ${y + r} A${r + 3} ${r + 3} 0 0 1 ${x + w + 1} ${y + r}`}
            fill="none"
            stroke={K}
            strokeWidth={4}
          />
          <rect fill={K} height={13} rx={3} width={8} x={x - 5} y={y + r - 6} />
          <rect fill={K} height={13} rx={3} width={8} x={x + w - 3} y={y + r - 6} />
        </>
      ) : null}
      {hat === "hardhat" ? (
        <>
          <path
            d={`M${x - 1} ${y + 10} Q${x - 1} ${y - 6} ${cx} ${y - 7} Q${x + w + 1} ${y - 6} ${x + w + 1} ${y + 10} Z`}
            fill={MINION_PAPER}
            stroke={K}
            strokeWidth={2.4}
          />
          <rect
            fill={MINION_PAPER}
            height={5}
            rx={2}
            stroke={K}
            strokeWidth={2.4}
            width={w + 12}
            x={x - 6}
            y={y + 7}
          />
          <line stroke={K} strokeWidth={1.6} x1={cx} x2={cx} y1={y - 6} y2={y + 7} />
        </>
      ) : null}
      {hat === "beanie" ? (
        <>
          <path
            d={`M${x + 1} ${y + 9} Q${x + 1} ${y - 5} ${cx} ${y - 5} Q${x + w - 1} ${y - 5} ${x + w - 1} ${y + 9} Z`}
            fill={MINION_METAL_DARK}
            stroke={K}
            strokeWidth={2.4}
          />
          <rect fill={K} height={6} rx={2} width={w} x={x} y={y + 6} />
          <circle cx={cx} cy={y - 7} fill={MINION_METAL} r={4} stroke={K} strokeWidth={2} />
        </>
      ) : null}
      {appearance.tie && hasBib ? (
        <path
          d={`M${cx - 3} ${bibTop - 6} H${cx + 3} L${cx + 2} ${bibTop - 2} L${cx + 4} ${bibTop + 9} L${cx} ${bibTop + 13} L${cx - 4} ${bibTop + 9} L${cx - 2} ${bibTop - 2} Z`}
          fill={K}
        />
      ) : null}
      {state === "working" && !noArms ? (
        <>
          <rect
            fill={MINION_SCREEN}
            height={21}
            rx={2.5}
            stroke={K}
            strokeWidth={2}
            width={32}
            x={cx - 16}
            y={ovTop - 11}
          />
          <circle
            cx={cx}
            cy={ovTop - 0.5}
            r={3.4}
            style={{ fill: S, ...cssAnim(animate, "mv-pulse 1.1s ease-in-out infinite") }}
          />
          <rect
            fill={MINION_METAL_DARK}
            height={3.5}
            rx={1.5}
            stroke={K}
            strokeWidth={1.6}
            width={38}
            x={cx - 19}
            y={ovTop + 9}
          />
        </>
      ) : null}
      {!noArms ? (
        <>
          <MinionArm
            hx={targets[0][0]}
            hy={targets[0][1]}
            out={targets[0][2]}
            skin={skin}
            sx={g.armL}
            sy={g.shY}
          />
          <MinionArm
            hx={targets[1][0]}
            hy={targets[1][1]}
            out={targets[1][2]}
            skin={skin}
            sx={g.armR}
            sy={g.shY}
          />
        </>
      ) : null}
      {!noExtras ? (
        <MinionExtras animate={animate} state={state} w={w} x={x} y={y - (hat ? 6 : 0)} />
      ) : null}
    </>
  );
}
