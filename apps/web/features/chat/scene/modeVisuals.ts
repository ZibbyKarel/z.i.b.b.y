import type { SceneColorToken } from "./tokens";
import type { SceneMode } from "./sceneTypes";

/**
 * The orb's per-mode visual target — the values the scene controller eases toward
 * every frame (nothing is applied hard). One place for the mode → colour/dynamics
 * mapping, so there are no scattered ternaries in the render loop.
 */
export interface OrbTarget {
  /** Design token the wireframe colour resolves from. */
  colorToken: SceneColorToken;
  /** Brightness multiplier on the resolved colour — kept near-1 for every mode; the
   * idle→working distinction is carried by `colorToken` (hue), not by dimming. */
  intensity: number;
  /** Vertex-noise displacement amplitude — the surface ripple. */
  noiseAmp: number;
  /** Noise time-evolution speed — how fast the surface churns. */
  noiseSpeed: number;
  /** Self-rotation speed, radians/second. */
  rotationSpeed: number;
  /** Periodic size-swell amplitude (0 = none) — the tool/streaming pulse. */
  pulseAmp: number;
  /** Pulse angular speed, radians/second. */
  pulseSpeed: number;
  /** Glow-shell halo strength, 0–1. */
  glow: number;
  /** Helix-ring opacity around the orb, 0–1 — fades in during `thinking`/`tool`. */
  rings: number;
}

/**
 * Base target per mode, before the streaming energy signal is folded in. Every mode
 * now carries near-full `intensity` (~0.9–1.0) — the orb reads present in every
 * state. The idle→working distinction is carried by `colorToken` instead: `idle` and
 * `listening` stay on the calm **accent** hue; `thinking`/`tool` shift to the **run**
 * (working) hue, matching `streaming` (already run); `waiting-approval` stays **warn**
 * (amber) and `error` stays **bad** (red) — matching ZIBBY's semantic tokens
 * (`runStateTone`: awaiting-approval → warn, error → bad) with no new brand colour.
 */
const BASE: Record<SceneMode, OrbTarget> = {
  // Dormant: calm accent, full presence, slow drift, gentle breathing.
  idle: {
    colorToken: "accent",
    intensity: 0.9,
    noiseAmp: 0.08,
    noiseSpeed: 0.18,
    rotationSpeed: 0.05,
    pulseAmp: 0,
    pulseSpeed: 0,
    glow: 0.35,
    rings: 0,
  },
  // Composing (operator typing): one notch more awake — brighter accent, quicker
  // breath. Not a jarring warm "recording" cue; text input has no privacy risk.
  listening: {
    colorToken: "accent",
    intensity: 0.95,
    noiseAmp: 0.12,
    noiseSpeed: 0.32,
    rotationSpeed: 0.09,
    pulseAmp: 0,
    pulseSpeed: 0,
    glow: 0.5,
    rings: 0,
  },
  // Reasoning / dispatching before the first token: shifts to the run (working) hue
  // — the idle→working change reads as a colour transition, not a brightness drop —
  // churns faster, rings up.
  thinking: {
    colorToken: "run",
    intensity: 0.95,
    noiseAmp: 0.2,
    noiseSpeed: 0.55,
    rotationSpeed: 0.16,
    pulseAmp: 0.05,
    pulseSpeed: 1.2,
    glow: 0.55,
    rings: 1,
  },
  // Tokens arriving: run colour, fastest flow. Energy (below) drives the pulse.
  streaming: {
    colorToken: "run",
    intensity: 1,
    noiseAmp: 0.16,
    noiseSpeed: 0.7,
    rotationSpeed: 0.22,
    pulseAmp: 0,
    pulseSpeed: 0,
    glow: 0.7,
    rings: 0.4,
  },
  // Mid-turn agent dispatch: run (working) hue + a pronounced pulse and rings.
  tool: {
    colorToken: "run",
    intensity: 1,
    noiseAmp: 0.14,
    noiseSpeed: 0.45,
    rotationSpeed: 0.15,
    pulseAmp: 0.16,
    pulseSpeed: 2.4,
    glow: 0.6,
    rings: 1,
  },
  // A run parked on the operator's decision: warn (amber) colour, present but calm,
  // slow warning pulse — a "needs you" attention tone, visibly distinct from error's
  // red.
  "waiting-approval": {
    colorToken: "warn",
    intensity: 0.85,
    noiseAmp: 0.07,
    noiseSpeed: 0.2,
    rotationSpeed: 0.05,
    pulseAmp: 0.05,
    pulseSpeed: 0.9,
    glow: 0.4,
    rings: 0,
  },
  // The turn errored: bad colour, sharp, nearly frozen.
  error: {
    colorToken: "bad",
    intensity: 1,
    noiseAmp: 0.05,
    noiseSpeed: 0.12,
    rotationSpeed: 0.02,
    pulseAmp: 0,
    pulseSpeed: 0,
    glow: 0.7,
    rings: 0,
  },
};

/**
 * The orb target for a mode, with the streaming energy signal (Tier 3) folded in.
 * In `streaming`, `energy` (0–1, asymmetric token cadence) drives the surface
 * displacement and a size pulse — the direct substitute for the reference design's
 * audio loudness → displacement mapping. Other modes ignore energy.
 */
export function orbTarget(mode: SceneMode, energy: number): OrbTarget {
  const base = BASE[mode];
  if (mode !== "streaming") return base;
  const e = Math.max(0, Math.min(1, energy));
  return {
    ...base,
    noiseAmp: base.noiseAmp + e * 0.22,
    noiseSpeed: base.noiseSpeed + e * 0.5,
    pulseAmp: 0.06 + e * 0.18,
    pulseSpeed: 3 + e * 3,
    glow: base.glow + e * 0.25,
  };
}
