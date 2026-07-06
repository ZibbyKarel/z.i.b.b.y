/* eslint-disable react/forbid-dom-props -- The orb is a bespoke HUD visual: the
   core disk's radial gradient/border glow, the per-mode nebula custom properties
   and blurred gradient layer, the brand-icon overlay, and the canvas layer's
   absolute positioning are all genuinely dynamic or brand values with no DS prop
   equivalent, so it uses the sanctioned style escape hatch — file-level rather
   than per-line. */
"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import { BrandIcon } from "../../../components/BrandIcon";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import type { OrbColorToken } from "./ChatOrbSphere";

const S = 264;
/** How far the nebula glow spills past the orb box on every side. */
const NEBULA_BLEED = 100;

export enum ChatOrbTestId {
  Root = "chat-orb",
  /** The static core disk — also the dynamic-import loading placeholder (see
   * the doc comment on {@link OrbCoreFallback}). */
  Fallback = "chat-orb-fallback",
}

/**
 * The orb's derived visual state, computed in {@link ChatScreen} purely from the
 * chat stream + composer signals (see `Rozhodnutí 1` in the phase-14 plan, extended
 * with `waiting-approval`/`error` by `Rozhodnutí 5` in the phase-15 plan) — never a
 * store of its own.
 */
export type ChatOrbMode =
  | "idle"
  | "listening"
  | "thinking"
  | "streaming"
  | "tool"
  | "waiting-approval"
  | "error";

export interface ChatOrbProps {
  /** Derived conversation state driving the orb's visual — see {@link ChatOrbMode}. */
  mode?: ChatOrbMode;
}

/**
 * Per-mode visual tuning for every layer: the sphere (color/noise/rotation/pulse,
 * `ChatOrbSphereProps`), the nebula CSS backdrop, the core disk and the brand icon.
 * See Rozhodnutí 6 in the phase-15 plan for the mode → color/dynamics mapping.
 */
interface ChatOrbVisual {
  /** `v-breath`/`v-glow-idle` cycle length; only used when `hot` is false. */
  breathS: number;
  /** Brand-icon overlay opacity. */
  iconOpacity: number;
  /** Core disk border alpha. */
  coreBorderOpacity: number;
  /** Hot = `v-glow-hot` core glow (thinking/streaming/tool/error — an action is
   * running, tokens are flowing, or the turn failed). Calmer modes breathe
   * instead. */
  hot: boolean;
  /** Primary nebula tint — becomes the wrapper's `--orb-nebula-a`. */
  nebulaA: string;
  /** Secondary nebula tint — becomes the wrapper's `--orb-nebula-b`. */
  nebulaB: string;
  /** Nebula layer intensity; the glow tokens are full-strength colors, so the
   * "low alpha" of the calm modes is expressed here (CSS-transitioned). */
  nebulaOpacity: number;
  /** Design token the sphere's wireframe color resolves from. */
  sphereColorToken: OrbColorToken;
  /** Brightness multiplier on the resolved sphere color — muted for the two "low
   * intensity" modes (idle, waiting-approval), full elsewhere. */
  sphereIntensity: number;
  /** Sphere vertex-noise displacement amplitude ("breathing" turbulence). */
  sphereNoiseAmp: number;
  /** Sphere noise time-evolution speed. */
  sphereNoiseSpeed: number;
  /** Sphere self-rotation speed, radians/second. */
  sphereRotationSpeed: number;
  /** Extra periodic noise-amplitude swell — the "tool"/"waiting-approval" pulse
   * (0 = no pulse), replacing the old ripple rings. */
  spherePulseAmp: number;
  /** Pulse angular speed, radians/second. */
  spherePulseSpeed: number;
}

/** Lookup keyed by mode — durations/opacities/tints/sphere dynamics only, no
 * scattered ternaries. Color transitions between entries are smoothed in
 * `ChatOrbSphere` (`THREE.Color.lerp` in `useFrame`), not here. */
const MODE_VISUALS: Record<ChatOrbMode, ChatOrbVisual> = {
  // Muted accent, low intensity, slow breathing — nothing is happening.
  idle: {
    breathS: 3.8,
    iconOpacity: 0.8,
    coreBorderOpacity: 0.1,
    hot: false,
    nebulaA: "var(--color-accent-glow)",
    nebulaB: "var(--color-run-glow)",
    nebulaOpacity: 0.16,
    sphereColorToken: "accent",
    sphereIntensity: 0.5,
    sphereNoiseAmp: 0.08,
    sphereNoiseSpeed: 0.18,
    sphereRotationSpeed: 0.05,
    spherePulseAmp: 0,
    spherePulseSpeed: 0,
  },
  // Idle base but one notch more awake: quicker breath cycle, brighter accent, a
  // touch more nebula — the operator is typing.
  listening: {
    breathS: 2.6,
    iconOpacity: 0.9,
    coreBorderOpacity: 0.15,
    hot: false,
    nebulaA: "var(--color-accent-glow)",
    nebulaB: "var(--color-run-glow)",
    nebulaOpacity: 0.28,
    sphereColorToken: "accent",
    sphereIntensity: 0.75,
    sphereNoiseAmp: 0.12,
    sphereNoiseSpeed: 0.3,
    sphereRotationSpeed: 0.09,
    spherePulseAmp: 0,
    spherePulseSpeed: 0,
  },
  // Full accent, faster deformation — a turn is being composed.
  thinking: {
    breathS: 3.8,
    iconOpacity: 1,
    coreBorderOpacity: 0.33,
    hot: true,
    nebulaA: "var(--color-accent-glow)",
    nebulaB: "var(--color-accent-glow)",
    nebulaOpacity: 0.5,
    sphereColorToken: "accent",
    sphereIntensity: 1,
    sphereNoiseAmp: 0.2,
    sphereNoiseSpeed: 0.55,
    sphereRotationSpeed: 0.16,
    spherePulseAmp: 0,
    spherePulseSpeed: 0,
  },
  // --color-run, fastest flow — tokens are streaming in.
  streaming: {
    breathS: 3.8,
    iconOpacity: 1,
    coreBorderOpacity: 0.33,
    hot: true,
    nebulaA: "var(--color-run-glow)",
    nebulaB: "var(--color-run-glow)",
    nebulaOpacity: 0.55,
    sphereColorToken: "run",
    sphereIntensity: 1,
    sphereNoiseAmp: 0.22,
    sphereNoiseSpeed: 0.85,
    sphereRotationSpeed: 0.24,
    spherePulseAmp: 0,
    spherePulseSpeed: 0,
  },
  // Accent + a pronounced pulse — the equivalent of the old ripple rings for a
  // running tool dispatch.
  tool: {
    breathS: 3.8,
    iconOpacity: 1,
    coreBorderOpacity: 0.33,
    hot: true,
    nebulaA: "var(--color-accent-glow)",
    nebulaB: "var(--color-accent-glow)",
    nebulaOpacity: 0.5,
    sphereColorToken: "accent",
    sphereIntensity: 1,
    sphereNoiseAmp: 0.14,
    sphereNoiseSpeed: 0.45,
    sphereRotationSpeed: 0.15,
    spherePulseAmp: 0.16,
    spherePulseSpeed: 2.4,
  },
  // --color-bad at low intensity, slow warning pulse — a run is parked on the
  // operator's decision, but this is a warning, not an alarm.
  "waiting-approval": {
    breathS: 2.2,
    iconOpacity: 0.78,
    coreBorderOpacity: 0.16,
    hot: false,
    nebulaA: "var(--color-bad-glow)",
    nebulaB: "var(--color-bad-glow)",
    nebulaOpacity: 0.22,
    sphereColorToken: "bad",
    sphereIntensity: 0.45,
    sphereNoiseAmp: 0.07,
    sphereNoiseSpeed: 0.2,
    sphereRotationSpeed: 0.05,
    spherePulseAmp: 0.05,
    spherePulseSpeed: 0.9,
  },
  // Full --color-bad — the turn errored out.
  error: {
    breathS: 3.8,
    iconOpacity: 0.85,
    coreBorderOpacity: 0.33,
    hot: true,
    nebulaA: "var(--color-bad-glow)",
    nebulaB: "var(--color-bad-glow)",
    nebulaOpacity: 0.55,
    sphereColorToken: "bad",
    sphereIntensity: 1,
    sphereNoiseAmp: 0.22,
    sphereNoiseSpeed: 0.5,
    sphereRotationSpeed: 0.12,
    spherePulseAmp: 0,
    spherePulseSpeed: 0,
  },
};

// Dynamic import so three.js + @react-three/fiber never load in SSR or jsdom
// component tests, and never ship in the HUD's initial bundle — the loading
// fallback is `null` because the core disk below is ALWAYS rendered (it is not
// just a transient placeholder), so there is nothing to show while the chunk
// downloads.
const ChatOrbSphereLazy = dynamic(
  () => import("./ChatOrbSphere").then((mod) => ({ default: mod.ChatOrbSphere })),
  { ssr: false, loading: () => null },
);

/**
 * The static core disk: today's radial-gradient "core orb" minus the SVG orbit
 * rings/ticks/ripples it used to sit inside (the wireframe sphere replaces
 * those). Rendered unconditionally — it doubles as the dynamic-import loading
 * placeholder for {@link ChatOrbSphereLazy} (so there is never a blank flash
 * before the WebGL chunk resolves) and as the permanent inner glow the brand
 * icon sits on, with the sphere as a shell around/behind it.
 */
function OrbCoreFallback({ hot, breathS, coreBorderOpacity, iconOpacity }: ChatOrbVisual) {
  return (
    <div
      data-testid={ChatOrbTestId.Fallback}
      style={{
        position: "absolute",
        inset: 34,
        borderRadius: "50%",
        background: "radial-gradient(circle at 38% 32%, #121d32, var(--color-background) 75%)",
        border: `1.5px solid rgba(91,141,239,${coreBorderOpacity})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color 0.4s",
        animation: hot
          ? "v-glow-hot 1.5s ease-in-out infinite"
          : `v-breath ${breathS}s ease-in-out infinite, v-glow-idle ${breathS}s ease-in-out infinite`,
      }}
    >
      <BrandIcon opacity={iconOpacity} size={150} />
    </div>
  );
}

/**
 * The central JARVIS-style orb, carried over from the old Voice UI as ZIBBY's
 * ambient presence behind the conversation: a soft nebula glow bleeding past
 * the box, a lazy-loaded r3f wireframe sphere (see {@link ChatOrbSphereLazy})
 * breathing above it, and a static core disk with the brand icon centered on
 * top. Driven entirely by `mode` (render-only) — see {@link ChatOrbMode}.
 */
export function ChatOrb({ mode = "idle" }: ChatOrbProps) {
  const v = MODE_VISUALS[mode];
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      data-mode={mode}
      data-testid={ChatOrbTestId.Root}
      style={
        {
          position: "relative",
          width: S,
          height: S,
          // Per-mode nebula tints as custom properties so the gradient below is
          // declared once and only the vars/opacity move between modes.
          "--orb-nebula-a": v.nebulaA,
          "--orb-nebula-b": v.nebulaB,
        } as CSSProperties
      }
    >
      {/* Nebula backdrop — a blurred two-lobe gradient spilling ~100px past the
          box, behind the canvas. Breathes on the existing v-breath keyframes;
          under reduced motion the pulse is dropped and only the opacity
          transition remains. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: -NEBULA_BLEED,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 36% 40%, var(--orb-nebula-a), transparent 62%), radial-gradient(circle at 64% 62%, var(--orb-nebula-b), transparent 66%)",
          filter: "blur(48px)",
          opacity: v.nebulaOpacity,
          transition: "opacity 0.6s ease",
          animation: reducedMotion ? undefined : `v-breath ${v.breathS}s ease-in-out infinite`,
        }}
      />

      {/* Wireframe sphere — fills the box, above the nebula, behind the core disk. */}
      <div style={{ position: "absolute", inset: 0 }}>
        <ChatOrbSphereLazy
          colorToken={v.sphereColorToken}
          intensity={v.sphereIntensity}
          noiseAmp={v.sphereNoiseAmp}
          noiseSpeed={v.sphereNoiseSpeed}
          pulseAmp={v.spherePulseAmp}
          pulseSpeed={v.spherePulseSpeed}
          rotationSpeed={v.sphereRotationSpeed}
        />
      </div>

      {/* Static core + brand icon, always on top of the sphere. */}
      <OrbCoreFallback {...v} />
    </div>
  );
}
