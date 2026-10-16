import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { MinionArm, MinionBody } from "./MinionBody";
import { type MinionSize, minionFigureWidth } from "./MinionFigure";
import type { MinionAppearance } from "./minionAppearance";
import { minionGeometry } from "./minionGeometry";
import { MINION_K, MINION_MUTED, MINION_PAPER, MINION_SKIN } from "./minionPalette";
import { At, rotValues } from "./minionSmil";

export enum MinionWalkerTestId {
  Root = "minion-walker-root",
}

export interface MinionWalkerProps {
  appearance: MinionAppearance;
  /** Carry a box in both hands (otherwise the arms swing). */
  carry?: boolean;
  size?: MinionSize;
  /** SMIL start offset in seconds, to desync several walkers. */
  phase?: number;
}

const STEP = ".5s";

/**
 * A marching minion, optionally carrying a box — port of the design's `walker()`.
 * SMIL ignores the CSS reduced-motion query, so with reduced motion on it renders the
 * same pose standing still.
 */
export function MinionWalker({
  appearance,
  carry = false,
  size = 48,
  phase = 0,
}: MinionWalkerProps) {
  const reduced = usePrefersReducedMotion();
  const begin = `${phase}s`;
  const g = minionGeometry({ appearance });
  const skin = MINION_SKIN[appearance.skin];
  const bx = g.cx;
  const by = g.ovTop - 3;

  return (
    <svg
      aria-hidden="true"
      data-carry={carry ? "true" : "false"}
      data-state="working"
      data-testid={MinionWalkerTestId.Root}
      height={size}
      style={{ display: "block", overflow: "visible", flexShrink: 0 }}
      viewBox="0 0 100 120"
      width={minionFigureWidth(size)}
    >
      <ellipse cx={50} cy={113} fill="rgba(17,19,18,.14)" rx={g.w * 0.6} ry={3.5} />
      <g>
        <MinionBody
          noArms
          noExtras
          noFloor
          appearance={appearance}
          begin={begin}
          eyeSt="working"
          look={[0, -1]}
          march={reduced ? undefined : STEP}
          state="working"
        />
        {carry ? (
          <>
            <g>
              <MinionArm hx={bx - 12} hy={by + 3} out={-8} skin={skin} sx={g.armL} sy={g.shY} />
            </g>
            <g>
              <MinionArm hx={bx + 12} hy={by + 3} out={8} skin={skin} sx={g.armR} sy={g.shY} />
            </g>
            <g>
              <rect
                fill={MINION_PAPER}
                height={19}
                stroke={MINION_K}
                strokeWidth={2.2}
                width={28}
                x={bx - 14}
                y={by - 10}
              />
              <path
                d={`M${bx - 9} ${by - 4} h18 M${bx - 9} ${by + 1} h12`}
                stroke={MINION_MUTED}
                strokeWidth={1.8}
              />
            </g>
            <circle cx={bx - 12} cy={by + 3} fill={MINION_K} r={4.8} />
            <circle cx={bx + 12} cy={by + 3} fill={MINION_K} r={4.8} />
          </>
        ) : (
          <>
            <g>
              <MinionArm
                hx={g.x - 5}
                hy={g.ovTop + 9}
                out={-6}
                skin={skin}
                sx={g.armL}
                sy={g.shY}
              />
              {reduced ? null : (
                <At
                  begin={begin}
                  dur={STEP}
                  type="rotate"
                  values={rotValues([24, -24, 24], g.armL, g.shY)}
                />
              )}
            </g>
            <g>
              <MinionArm
                hx={g.x + g.w + 5}
                hy={g.ovTop + 9}
                out={6}
                skin={skin}
                sx={g.armR}
                sy={g.shY}
              />
              {reduced ? null : (
                <At
                  begin={begin}
                  dur={STEP}
                  type="rotate"
                  values={rotValues([-24, 24, -24], g.armR, g.shY)}
                />
              )}
            </g>
          </>
        )}
        {reduced ? null : (
          <At begin={begin} dur={STEP} type="translate" values="0 0;0 -2.5;0 0;0 -2.5;0 0" />
        )}
      </g>
    </svg>
  );
}
