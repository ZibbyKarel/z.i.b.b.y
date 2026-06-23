/* eslint-disable react/forbid-dom-props -- The orb is a bespoke HUD visual built
   from per-element decorative inline styles (orbital ring durations that change
   with state, SVG dash/animation values, radial gradients). Every one is a
   genuinely dynamic or brand value with no DS prop equivalent, so it uses the
   sanctioned style escape hatch — file-level rather than per-line. */
import Image from "next/image";
import { Typography } from "@zibby/design-system";

const ACCENT = "var(--color-accent)";
const S = 264;
const CX = 132;

export interface ChatOrbProps {
  /** ZIBBY is composing a reply — the orb quickens, glows hot and spins a think arc. */
  thinking?: boolean;
}

/**
 * The central JARVIS-style orb, carried over from the old Voice UI as ZIBBY's
 * ambient presence behind the conversation. A breathing core mark wrapped in
 * counter-rotating dashed orbits with tick marks; while `thinking` the orbits
 * quicken, a progress arc sweeps and ripple rings expand. The chat is text-only,
 * so the listening/speaking waveform of the old orb is dropped — there are just
 * two states: idle and thinking. Driven entirely by props (render-only).
 */
export function ChatOrb({ thinking = false }: ChatOrbProps) {
  return (
    <div style={{ position: "relative", width: S, height: S }}>
      {/* Ripple rings (thinking only) */}
      {thinking &&
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
          opacity={thinking ? 0.5 : 0.22}
          r={CX - 6}
          stroke={ACCENT}
          strokeDasharray="3 13"
          strokeWidth="1"
          style={{
            transformOrigin: `${CX}px ${CX}px`,
            animation: `v-orbit-cw ${thinking ? "3.2s" : "20s"} linear infinite`,
          }}
        />
        {/* second dashed orbit (counter, small) */}
        <circle
          cx={CX}
          cy={CX}
          fill="none"
          opacity={thinking ? 0.35 : 0.12}
          r={CX - 22}
          stroke={ACCENT}
          strokeDasharray="2 18"
          strokeWidth="0.8"
          style={{
            transformOrigin: `${CX}px ${CX}px`,
            animation: `v-orbit-ccw ${thinking ? "4s" : "28s"} linear infinite`,
          }}
        />
        {/* inner arc (partial, fast) */}
        <path
          d={`M ${CX} ${CX - (CX - 40)} A ${CX - 40} ${CX - 40} 0 0 1 ${CX + (CX - 40)} ${CX}`}
          fill="none"
          opacity={thinking ? 0.72 : 0.38}
          stroke={ACCENT}
          strokeWidth={thinking ? "2" : "1.2"}
          style={{
            transformOrigin: `${CX}px ${CX}px`,
            animation: `v-orbit-ccw ${thinking ? "2.2s" : "13s"} linear infinite`,
          }}
        />
        {/* thinking progress arc */}
        {thinking && (
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
              opacity={thinking ? 0.5 : 0.18}
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
          border: `1.5px solid rgba(91,141,239,${thinking ? 0.33 : 0.13})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "border-color 0.4s",
          animation: thinking
            ? "v-glow-hot 1.5s ease-in-out infinite"
            : "v-breath 3.8s ease-in-out infinite, v-glow-idle 3.8s ease-in-out infinite",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Image
            alt="ZIBBY"
            height={40}
            src="/z.i.b.b.y-icon.png"
            style={{ borderRadius: "50%", opacity: thinking ? 1 : 0.85 }}
            width={40}
          />
          <Typography
            mono
            size="2xs"
            style={{ opacity: thinking ? 0.9 : 0.5 }}
            tone="accent"
            tracking="mono"
            type="note"
          >
            Z·I·B·B·Y
          </Typography>
        </div>
      </div>
    </div>
  );
}
