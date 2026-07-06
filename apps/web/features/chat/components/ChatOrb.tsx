/* eslint-disable react/forbid-dom-props -- The orb is a bespoke HUD visual built
   from per-element decorative inline styles (orbital ring durations that change
   with state, SVG dash/animation values, radial gradients). Every one is a
   genuinely dynamic or brand value with no DS prop equivalent, so it uses the
   sanctioned style escape hatch — file-level rather than per-line. */
import { BrandIcon } from "../../../components/BrandIcon";

const ACCENT = "var(--color-accent)";
const S = 264;
const CX = 132;

export enum ChatOrbTestId {
  Root = "chat-orb",
}

/**
 * The orb's derived visual state, computed in {@link ChatScreen} purely from the
 * chat stream + composer signals (see `Rozhodnutí 1` in the phase-14 plan) — never
 * a store of its own.
 */
export type ChatOrbMode = "idle" | "listening" | "thinking" | "streaming" | "tool";

export interface ChatOrbProps {
  /** Derived conversation state driving the orb's visual — see {@link ChatOrbMode}. */
  mode?: ChatOrbMode;
}

/** Per-mode visual tuning — durations/opacities only, reusing existing keyframes. */
interface ChatOrbVisual {
  /** `v-breath`/`v-glow-idle` cycle length; only used when `hot` is false. */
  breathS: number;
  outerOrbitS: number;
  outerOpacity: number;
  innerOrbitS: number;
  innerOpacity: number;
  arcOrbitS: number;
  arcOpacity: number;
  arcStrokeWidth: number;
  tickOpacity: number;
  coreBorderOpacity: number;
  iconOpacity: number;
  /** Hot = `v-glow-hot` core glow + the thinking progress arc (thinking/streaming/tool). */
  hot: boolean;
  /** Show the `v-ripple` rings (tool only — an action is running in the system). */
  ripple: boolean;
}

// Today's `thinking` visual (Fáze 0 baseline) — streaming/tool derive from it so the
// three "busy" modes share one source of truth instead of duplicated numbers.
const THINKING_VISUAL: ChatOrbVisual = {
  breathS: 3.8,
  outerOrbitS: 3.2,
  outerOpacity: 0.5,
  innerOrbitS: 4,
  innerOpacity: 0.35,
  arcOrbitS: 2.2,
  arcOpacity: 0.72,
  arcStrokeWidth: 2,
  tickOpacity: 0.5,
  coreBorderOpacity: 0.33,
  iconOpacity: 1,
  hot: true,
  ripple: false,
};

/** Lookup keyed by mode — durations/opacities only, no scattered ternaries. */
const MODE_VISUALS: Record<ChatOrbMode, ChatOrbVisual> = {
  idle: {
    breathS: 3.8,
    outerOrbitS: 20,
    outerOpacity: 0.22,
    innerOrbitS: 28,
    innerOpacity: 0.12,
    arcOrbitS: 13,
    arcOpacity: 0.38,
    arcStrokeWidth: 1.2,
    tickOpacity: 0.18,
    coreBorderOpacity: 0.13,
    iconOpacity: 0.85,
    hot: false,
    ripple: false,
  },
  // Idle base but slightly awakened: quicker breath cycle + a brighter/faster outer
  // orbit (opacity/duration between idle and thinking) — the operator is typing.
  listening: {
    breathS: 2.6,
    outerOrbitS: 14,
    outerOpacity: 0.36,
    innerOrbitS: 28,
    innerOpacity: 0.12,
    arcOrbitS: 13,
    arcOpacity: 0.38,
    arcStrokeWidth: 1.2,
    tickOpacity: 0.18,
    coreBorderOpacity: 0.13,
    iconOpacity: 0.85,
    hot: false,
    ripple: false,
  },
  thinking: THINKING_VISUAL,
  // Thinking visual, orbits one notch faster — tokens are flowing.
  streaming: { ...THINKING_VISUAL, outerOrbitS: 2.6 },
  // Thinking visual plus the ripple rings — an action is running in the system.
  tool: { ...THINKING_VISUAL, ripple: true },
};

/**
 * The central JARVIS-style orb, carried over from the old Voice UI as ZIBBY's
 * ambient presence behind the conversation. A breathing core mark wrapped in
 * counter-rotating dashed orbits with tick marks; busy modes (thinking/streaming/
 * tool) glow hot, sweep a progress arc and spin the orbits faster, and `tool` adds
 * expanding ripple rings for an in-flight action. Driven entirely by `mode`
 * (render-only) — see {@link ChatOrbMode}.
 */
export function ChatOrb({ mode = "idle" }: ChatOrbProps) {
  const v = MODE_VISUALS[mode];

  return (
    <div data-mode={mode} data-testid={ChatOrbTestId.Root} style={{ position: "relative", width: S, height: S }}>
      {/* Ripple rings (tool only) */}
      {v.ripple &&
        [0, 1, 2].map((i) => (
          <div
            aria-hidden="true"
            key={i}
            style={{
              position: "absolute",
              borderRadius: "50%",
              border: `1px solid ${ACCENT}`,
              inset: -(28 + i * 30),
              opacity: 0,
              pointerEvents: "none",
              animation: `v-ripple 2.8s ease-out ${i * 0.92}s infinite`,
            }}
          />
        ))}

      {/* SVG orbital rings */}
      <svg
        aria-hidden="true"
        height={S}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
        viewBox={`0 0 ${S} ${S}`}
        width={S}
      >
        {/* outer dashed orbit */}
        <circle
          cx={CX}
          cy={CX}
          fill="none"
          opacity={v.outerOpacity}
          r={CX - 6}
          stroke={ACCENT}
          strokeDasharray="3 13"
          strokeWidth="1"
          style={{
            transformOrigin: `${CX}px ${CX}px`,
            animation: `v-orbit-cw ${v.outerOrbitS}s linear infinite`,
          }}
        />
        {/* second dashed orbit (counter, small) */}
        <circle
          cx={CX}
          cy={CX}
          fill="none"
          opacity={v.innerOpacity}
          r={CX - 22}
          stroke={ACCENT}
          strokeDasharray="2 18"
          strokeWidth="0.8"
          style={{
            transformOrigin: `${CX}px ${CX}px`,
            animation: `v-orbit-ccw ${v.innerOrbitS}s linear infinite`,
          }}
        />
        {/* inner arc (partial, fast) */}
        <path
          d={`M ${CX} ${CX - (CX - 40)} A ${CX - 40} ${CX - 40} 0 0 1 ${CX + (CX - 40)} ${CX}`}
          fill="none"
          opacity={v.arcOpacity}
          stroke={ACCENT}
          strokeWidth={v.arcStrokeWidth}
          style={{
            transformOrigin: `${CX}px ${CX}px`,
            animation: `v-orbit-ccw ${v.arcOrbitS}s linear infinite`,
          }}
        />
        {/* thinking progress arc (busy modes only) */}
        {v.hot && (
          <circle
            cx={CX}
            cy={CX}
            fill="none"
            opacity="0.85"
            r={CX - 56}
            stroke={ACCENT}
            strokeDasharray="220"
            strokeDashoffset="220"
            strokeWidth="2.5"
            style={{
              transformOrigin: `${CX}px ${CX}px`,
              transform: "rotate(-90deg)",
              animation: "v-think-spin 2.4s ease-in-out infinite alternate",
            }}
          />
        )}
        {/* tick marks on outer orbit */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
          const r0 = CX - 6;
          const r1 = CX - 14;
          const rad = ((deg - 90) * Math.PI) / 180;
          return (
            <line
              key={i}
              opacity={v.tickOpacity}
              stroke={ACCENT}
              strokeWidth="1"
              x1={CX + Math.cos(rad) * r0}
              x2={CX + Math.cos(rad) * r1}
              y1={CX + Math.sin(rad) * r0}
              y2={CX + Math.sin(rad) * r1}
            />
          );
        })}
      </svg>

      {/* Core orb */}
      <div
        style={{
          position: "absolute",
          inset: 34,
          borderRadius: "50%",
          background: "radial-gradient(circle at 38% 32%, #121d32, var(--color-background) 75%)",
          border: `1.5px solid rgba(91,141,239,${v.coreBorderOpacity})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "border-color 0.4s",
          animation: v.hot
            ? "v-glow-hot 1.5s ease-in-out infinite"
            : `v-breath ${v.breathS}s ease-in-out infinite, v-glow-idle ${v.breathS}s ease-in-out infinite`,
        }}
      >
        <BrandIcon opacity={v.iconOpacity} size={150} />
      </div>
    </div>
  );
}
