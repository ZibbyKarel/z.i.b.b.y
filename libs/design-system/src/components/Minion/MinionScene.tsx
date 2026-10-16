import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { type StateTone, stateToneVar } from "../../stateTone";
import { MinionArm, MinionBody } from "./MinionBody";
import type { MinionAppearance } from "./minionAppearance";
import { type MinionGeometry, minionGeometry } from "./minionGeometry";
import {
  MINION_DENIM,
  MINION_DESK,
  MINION_FLESH,
  MINION_GROUND,
  MINION_K,
  MINION_METAL,
  MINION_METAL_DARK,
  MINION_PANEL,
  MINION_PEEL,
  MINION_SCREEN,
  MINION_SCREEN_OFF,
  MINION_SKIN,
  MINION_SOOT,
  MINION_WHITE,
} from "./minionPalette";
import { An, At, rotValues } from "./minionSmil";

const K = MINION_K;

export enum MinionSceneTestId {
  Root = "minion-scene-root",
}

export interface MinionSceneProps {
  appearance: MinionAppearance;
  state: StateTone;
  /** Seconds offset; becomes the SMIL `begin` so several scenes can desync. */
  phase?: number;
  /** Draw the floor line (default true). The design's `ng` is the inverse. */
  ground?: boolean;
}

interface PartProps {
  appearance: MinionAppearance;
  /** SMIL begin offset in seconds. */
  bn: number;
}

/** Skin colour of an appearance. */
const skinOf = (a: MinionAppearance) => MINION_SKIN[a.skin];

interface ArmGProps {
  g: MinionGeometry;
  side: "L" | "R";
  hand: readonly [number, number];
  out: number;
  skin: string;
  pre?: ReactNode;
  children?: ReactNode;
}

/** Design `armG`: an arm in its own group so a SMIL rotate pivots on the shoulder. */
function ArmG({ g, side, hand, out, skin, pre, children }: ArmGProps) {
  return (
    <g>
      {pre}
      <MinionArm
        hx={hand[0]}
        hy={hand[1]}
        out={out}
        skin={skin}
        sx={side === "L" ? g.armL : g.armR}
        sy={g.shY}
      />
      {children}
    </g>
  );
}

function Monitor({ tone, bn, broken }: { tone: string; bn: number; broken: boolean }) {
  const widths = [24, 14, 30, 18] as const;
  return (
    <g transform="translate(0 8)">
      <rect
        fill={MINION_METAL_DARK}
        height={6}
        stroke={K}
        strokeWidth={1.6}
        width={6}
        x={31}
        y={80}
      />
      <rect
        fill={MINION_METAL_DARK}
        height={3}
        rx={1}
        stroke={K}
        strokeWidth={1.6}
        width={20}
        x={24}
        y={85}
      />
      <rect
        fill={broken ? MINION_SCREEN_OFF : MINION_SCREEN}
        height={32}
        rx={3}
        stroke={K}
        strokeWidth={2.2}
        width={48}
        x={10}
        y={50}
      />
      {broken ? (
        <>
          <rect height={28} opacity={0.3} style={{ fill: tone }} width={44} x={12} y={52} />
          <path
            d="M22 52 L30 64 L26 69 L36 80 M30 64 L43 59 L50 66"
            fill="none"
            stroke={MINION_WHITE}
            strokeLinejoin="round"
            strokeWidth={1.4}
          />
        </>
      ) : (
        widths.map((W, i) => {
          const t0 = i * 0.22;
          return (
            <rect
              height={2.6}
              key={W}
              rx={1}
              style={{ fill: i % 2 ? MINION_METAL_DARK : tone }}
              width={0}
              x={15}
              y={56 + i * 6}
            >
              <An
                attr="width"
                begin={`${bn}s`}
                dur="2.4s"
                keyTimes={`0;${t0};${t0 + 0.2};1`}
                values={`0;0;${W};${W}`}
              />
            </rect>
          );
        })
      )}
    </g>
  );
}

function Desk() {
  return (
    <>
      <rect fill={MINION_PANEL} height={22} stroke={K} strokeWidth={2} width={136} x={12} y={100} />
      <rect
        fill={MINION_DESK}
        height={5}
        rx={1}
        stroke={K}
        strokeWidth={2}
        width={148}
        x={6}
        y={96}
      />
    </>
  );
}

function Keyboard({ g }: { g: MinionGeometry }) {
  return (
    <rect
      fill={MINION_METAL}
      height={4}
      rx={1}
      stroke={K}
      strokeWidth={1.6}
      width={34}
      x={g.cx - 17}
      y={92.5}
    />
  );
}

function Puff({
  x,
  y,
  r,
  d,
  bn,
  rise,
}: {
  x: number;
  y: number;
  r: number;
  d: number;
  bn: number;
  rise: number;
}) {
  const begin = `${bn - d}s`;
  return (
    <circle cx={x} cy={y} fill="#8A8E88" r={r} stroke={K} strokeWidth={1.2}>
      <At begin={begin} dur="1.8s" type="translate" values={`0 0;${r * 0.4} ${-rise}`} />
      <An attr="opacity" begin={begin} dur="1.8s" values="0;.9;0" />
    </circle>
  );
}

function WorkScene({ appearance, bn }: PartProps) {
  const tone = stateToneVar.working;
  const gy = 89 + appearance.height * 0.26;
  const g = minionGeometry({ appearance, cx: 100, gy });
  const sk = skinOf(appearance);
  return (
    <>
      <Monitor bn={bn} broken={false} tone={tone} />
      <MinionBody
        noArms
        noExtras
        noFloor
        appearance={appearance}
        cx={100}
        gy={gy}
        look={[-5, 3]}
        state="working"
      />
      <Desk />
      <Keyboard g={g} />
      <ArmG g={g} hand={[g.cx - 8, 94]} out={-8} side="L" skin={sk}>
        <At
          begin={`${bn}s`}
          dur=".3s"
          type="rotate"
          values={rotValues([0, -10, 0], g.armL, g.shY)}
        />
      </ArmG>
      <ArmG g={g} hand={[g.cx + 8, 94]} out={8} side="R" skin={sk}>
        <At
          begin={`${bn + 0.15}s`}
          dur=".3s"
          type="rotate"
          values={rotValues([0, 10, 0], g.armR, g.shY)}
        />
      </ArmG>
    </>
  );
}

function ThinkScene({ appearance, bn }: PartProps) {
  const tone = stateToneVar.thinking;
  const b = `${bn}s`;
  const step = ".8s";
  const g = minionGeometry({ appearance, cx: 80, gy: 101 });
  const sk = skinOf(appearance);
  const bx = g.cx + g.w / 2 + 10;
  const by = g.top - 10;
  return (
    <g>
      <g>
        <MinionBody
          noArms
          noExtras
          appearance={appearance}
          begin={b}
          cx={80}
          gy={101}
          march={step}
          state="thinking"
        />
        <ArmG g={g} hand={[g.x - 5, g.ovTop + 9]} out={-6} side="L" skin={sk}>
          <At begin={b} dur={step} type="rotate" values={rotValues([24, -24, 24], g.armL, g.shY)} />
        </ArmG>
        <ArmG g={g} hand={[g.x + g.w + 5, g.ovTop + 9]} out={6} side="R" skin={sk}>
          <At
            begin={b}
            dur={step}
            type="rotate"
            values={rotValues([-24, 24, -24], g.armR, g.shY)}
          />
        </ArmG>
        <At begin={b} dur={step} type="translate" values="0 0;0 -2.5;0 0;0 -2.5;0 0" />
      </g>
      <g>
        <circle cx={bx - 7} cy={by + 12} r={2.2} style={{ fill: tone }} />
        <circle cx={bx - 3} cy={by + 6} r={3.2} style={{ fill: tone }} />
        <circle cx={bx + 4} cy={by - 4} r={9} strokeWidth={2} style={{ fill: tone, stroke: K }} />
        <text
          fill={MINION_WHITE}
          fontFamily="Geist, sans-serif"
          fontSize={12}
          fontWeight={700}
          textAnchor="middle"
          x={bx + 4}
          y={by}
        >
          ?
        </text>
        <At begin={b} dur="1.6s" type="translate" values="0 0;0 -2;0 0" />
      </g>
      <At begin={b} dur="6s" type="translate" values="-24 0;20 0;-24 0" />
    </g>
  );
}

function BlockScene({ appearance, bn }: PartProps) {
  const tone = stateToneVar.blocked;
  const b = `${bn}s`;
  const D = "3.2s";
  const kt = "0;.1;.2;.3;.4;.5;.6;.85;1";
  const g = minionGeometry({ appearance, cx: 72, gy: 101 });
  const sk = skinOf(appearance);
  const hx = g.x + g.w + 8;
  const hy = g.top - 2;
  return (
    <>
      <g>
        <MinionBody
          noArms
          noExtras
          appearance={appearance}
          cx={72}
          eyeSt="working"
          gy={101}
          look={[2, -4]}
          state="blocked"
        />
        <ArmG g={g} hand={[g.x - 5, g.ovTop + 9]} out={-6} side="L" skin={sk} />
        <ArmG g={g} hand={[hx, hy]} out={10} side="R" skin={sk}>
          <At
            begin={b}
            dur={D}
            keyTimes={kt}
            type="rotate"
            values={rotValues([150, 0, -12, 8, -12, 8, 0, 0, 150], g.armR, g.shY)}
          />
        </ArmG>
        <At
          begin={b}
          dur={D}
          keyTimes={kt}
          type="translate"
          values="0 0;0 0;0 -3;0 0;0 -3;0 0;0 0;0 0;0 0"
        />
      </g>
      <g>
        <circle
          cx={hx + 13}
          cy={hy - 11}
          r={8.5}
          strokeWidth={2}
          style={{ fill: tone, stroke: K }}
        />
        <rect fill={MINION_WHITE} height={6.5} rx={1} width={2.4} x={hx + 11.8} y={hy - 16.5} />
        <circle cx={hx + 13} cy={hy - 6.8} fill={MINION_WHITE} r={1.4} />
        <An attr="opacity" begin={b} dur={D} keyTimes={kt} values="0;1;1;1;1;1;1;1;0" />
      </g>
    </>
  );
}

function starPoints(R1: number, R2: number): string {
  return Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    const r = i % 2 ? R2 : R1;
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
}

function ErrorScene({ appearance, bn }: PartProps) {
  const tone = stateToneVar.error;
  const D = "5s";
  const b = `${bn}s`;
  const eAppearance: MinionAppearance = appearance.hat
    ? appearance
    : { ...appearance, hair: "spikes" };
  const gy = 89 + appearance.height * 0.26;
  const g = minionGeometry({ appearance: eAppearance, cx: 100, gy });
  const sk = skinOf(appearance);
  const soot: readonly (readonly [number, number, number])[] = [
    [g.x + g.w * 0.18, g.my, 3.6],
    [g.x + g.w * 0.82, g.my - 2, 3],
    [g.cx + 7, g.y + 5, 3.2],
    [g.cx - 9, g.y + 8, 2.2],
    [g.cx, g.my + 6, 2.4],
  ];
  const puffs: readonly (readonly [number, number, number, number, number])[] = [
    [26, 56, 6, 0, 34],
    [36, 54, 8, 0.6, 34],
    [44, 57, 5, 1.2, 34],
    [g.cx - 4, g.top - 1, 4, 0.3, 18],
    [g.cx + 6, g.top - 2, 3, 1, 18],
  ];
  return (
    <>
      <g>
        <WorkScene appearance={appearance} bn={bn} />
        <An attr="opacity" begin={b} calcMode="discrete" dur={D} keyTimes="0;.56" values="1;0" />
      </g>
      <g opacity={0}>
        <Monitor broken bn={bn} tone={tone} />
        <g>
          <MinionBody
            noArms
            noExtras
            noFloor
            appearance={eAppearance}
            cx={100}
            gy={gy}
            state="error"
          />
          {soot.map(([x, y, r]) => (
            <circle cx={x} cy={y} fill={MINION_SOOT} key={`so${x}`} r={r} />
          ))}
          <ArmG g={g} hand={[g.x - 3, g.eyeY - 12]} out={-12} side="L" skin={sk} />
          <ArmG g={g} hand={[g.x + g.w + 3, g.eyeY - 12]} out={12} side="R" skin={sk} />
          <At
            begin={b}
            dur={D}
            keyTimes="0;.56;.58;.6;.62;.64;.66;1"
            type="translate"
            values="0 0;0 0;-2 0;2 0;-2 0;2 0;0 0;0 0"
          />
        </g>
        <Desk />
        <Keyboard g={g} />
        {puffs.map(([x, y, r, d, rise]) => (
          <Puff bn={bn} d={d} key={`pf${x}_${y}`} r={r} rise={rise} x={x} y={y} />
        ))}
        <An attr="opacity" begin={b} calcMode="discrete" dur={D} keyTimes="0;.56" values="0;1" />
      </g>
      <g transform="translate(34 72)">
        <g transform="scale(0)">
          <polygon fill={MINION_SKIN[0]} points={starPoints(30, 15)} stroke={K} strokeWidth={2} />
          <polygon points={starPoints(17, 8)} strokeWidth={1.6} style={{ fill: tone, stroke: K }} />
          <At
            begin={b}
            dur={D}
            keyTimes="0;.54;.59;.66;.78;1"
            type="scale"
            values="0;0;1.3;1;0;0"
          />
        </g>
      </g>
      <rect fill={MINION_WHITE} height={120} opacity={0} width={160} x={0} y={0}>
        <An attr="opacity" begin={b} dur={D} keyTimes="0;.55;.565;.64;1" values="0;0;.85;0;0" />
      </rect>
    </>
  );
}

function DoneScene({ appearance, bn }: PartProps) {
  const tone = stateToneVar.done;
  const b = `${bn}s`;
  const D = ".9s";
  const g = minionGeometry({ appearance, cx: 80, gy: 101 });
  const sk = skinOf(appearance);
  const fy = g.gy + 6;
  const confettiFills = [tone, K, MINION_DENIM, MINION_SKIN[0]] as const;
  return (
    <>
      <ellipse
        cx={g.cx}
        cy={g.gy + 9}
        fillOpacity={0.33}
        rx={g.w * 0.7}
        ry={4.5}
        style={{ fill: tone }}
      >
        <An attr="rx" begin={b} dur=".45s" values={`${g.w * 0.7};${g.w * 0.5};${g.w * 0.7}`} />
      </ellipse>
      {Array.from({ length: 10 }, (_, i) => {
        const x = 8 + i * 15.5;
        const d = 1.8 + (i % 3) * 0.5;
        const begin = `${bn - i * 0.33}s`;
        return (
          <rect
            height={2.8}
            key={`cf${x}`}
            style={{ fill: confettiFills[i % 4] }}
            width={4}
            x={x}
            y={-8}
          >
            <At begin={begin} dur={`${d}s`} type="translate" values={`0 0;${i % 2 ? 7 : -7} 130`} />
            <At
              additive="sum"
              begin={begin}
              dur=".9s"
              type="rotate"
              values={`0 ${x + 2} -6;360 ${x + 2} -6`}
            />
          </rect>
        );
      })}
      <g>
        <g>
          <MinionBody
            noArms
            noExtras
            noFloor
            appearance={appearance}
            cx={80}
            gy={101}
            state="done"
          />
          <ArmG g={g} hand={[g.x - 10, g.top - 2]} out={-4} side="L" skin={sk}>
            <At begin={b} dur={D} type="rotate" values={rotValues([-16, 16, -16], g.armL, g.shY)} />
          </ArmG>
          <ArmG g={g} hand={[g.x + g.w + 10, g.top - 2]} out={4} side="R" skin={sk}>
            <At begin={b} dur={D} type="rotate" values={rotValues([-16, 16, -16], g.armR, g.shY)} />
          </ArmG>
          <At begin={b} dur={D} type="rotate" values={rotValues([-9, 9, -9], g.cx, fy)} />
        </g>
        <At begin={b} dur=".45s" type="translate" values="0 0;0 -5;0 0" />
      </g>
    </>
  );
}

function IdleScene({ appearance, bn }: PartProps) {
  const b = `${bn}s`;
  const g = minionGeometry({ appearance, cx: 84, gy: 95 });
  const sk = skinOf(appearance);
  const sl = g.cx - g.w / 2 - 5;
  const sr = g.cx + g.w / 2 + 5;
  const hx = g.cx + 11;
  const hy = g.my + 10;
  const peel = { fill: MINION_PEEL, stroke: K, strokeWidth: 1.6, strokeLinejoin: "round" } as const;
  return (
    <>
      <ellipse cx={g.cx} cy={111} fill="rgba(17,19,18,.12)" rx={g.w * 0.75} ry={3.5} />
      <path
        d={`M${sl + 4} ${g.gy - 5} L${sl + 1} 110 M${sr - 4} ${g.gy - 5} L${sr - 1} 110 M${sl + 2.5} 103 H${sr - 2.5}`}
        fill="none"
        stroke={K}
        strokeLinecap="round"
        strokeWidth={2.4}
      />
      <rect
        fill={MINION_METAL_DARK}
        height={5}
        rx={2}
        stroke={K}
        strokeWidth={2}
        width={sr - sl}
        x={sl}
        y={g.gy - 9}
      />
      <path
        d="M24 109 q-2 -7 3 -9 q1 4 0 9 z M28 109 q4 -6 9 -5 q-3 4 -7 5 z"
        fill={MINION_PEEL}
        stroke={K}
        strokeLinejoin="round"
        strokeWidth={1.4}
      />
      <MinionBody
        noArms
        noExtras
        noFloor
        appearance={appearance}
        cx={84}
        eyeSt="done"
        gy={95}
        mouthSt="none"
        state="idle"
      />
      <ellipse cx={g.cx - 1} cy={g.my + 1} fill={K} rx={2.6} ry={1}>
        <An attr="ry" begin={b} dur=".45s" values="1;2.6;1" />
      </ellipse>
      <ArmG g={g} hand={[g.x - 2, g.ovTop + 9]} out={-6} side="L" skin={sk} />
      <ArmG
        g={g}
        hand={[hx, hy]}
        out={14}
        pre={
          <>
            <path
              d={`M${hx - 2} ${hy - 2} Q${hx - 8} ${hy - 11} ${hx - 5} ${hy - 17} Q${hx + 1} ${hy - 11} ${hx + 2} ${hy - 2} Z`}
              fill={MINION_FLESH}
              stroke={K}
              strokeLinejoin="round"
              strokeWidth={1.6}
            />
            <path d={`M${hx - 2} ${hy - 3} q-7 1 -8 8 q4 -1 7 -4 z`} {...peel} />
            <path d={`M${hx + 2} ${hy - 3} q7 1 8 8 q-4 -1 -7 -4 z`} {...peel} />
          </>
        }
        side="R"
        skin={sk}
      >
        <At
          begin={b}
          dur="2.6s"
          keyTimes="0;.35;.45;.8;1"
          type="rotate"
          values={rotValues([0, 0, 12, 12, 0], g.armR, g.shY)}
        />
      </ArmG>
    </>
  );
}

function SceneContent({ state, appearance, bn }: PartProps & { state: StateTone }) {
  switch (state) {
    case "working":
      return <WorkScene appearance={appearance} bn={bn} />;
    case "thinking":
      return <ThinkScene appearance={appearance} bn={bn} />;
    case "blocked":
      return <BlockScene appearance={appearance} bn={bn} />;
    case "error":
      return <ErrorScene appearance={appearance} bn={bn} />;
    case "done":
      return <DoneScene appearance={appearance} bn={bn} />;
    case "idle":
      return <IdleScene appearance={appearance} bn={bn} />;
  }
}

/**
 * The animated desk vignette for a minion in one of the six states — port of the
 * design's `scene3()`. SMIL-driven (state-keyed so a state change remounts the
 * animation); SMIL ignores the CSS reduced-motion query, so with reduced motion on it
 * renders the static figure in the same frame instead.
 */
export function MinionScene({ appearance, state, phase = 0, ground = true }: MinionSceneProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <svg
      aria-hidden="true"
      data-state={state}
      data-testid={MinionSceneTestId.Root}
      style={{ display: "block", overflow: "hidden", aspectRatio: "4 / 3", width: "100%" }}
      viewBox="0 0 160 120"
      width="100%"
    >
      {ground ? (
        <line stroke={MINION_GROUND} strokeWidth={1} x1={0} x2={160} y1={110.5} y2={110.5} />
      ) : null}
      {reduced ? (
        <MinionBody animate={false} appearance={appearance} cx={80} state={state} />
      ) : (
        <g key={state}>
          <SceneContent appearance={appearance} bn={phase} state={state} />
        </g>
      )}
    </svg>
  );
}
