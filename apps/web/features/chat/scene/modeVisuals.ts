import type { SubsystemState } from "@zibby/contracts";
import type { SceneColorToken } from "./tokens";
import type { SceneMode } from "./sceneTypes";

/**
 * The orb's per-mode visual target — the values the scene controller eases toward
 * every frame (nothing is applied hard). One place for the mode → colour/dynamics
 * mapping, so there are no scattered ternaries in the render loop.
 */
export interface OrbTarget {
  /** Design token the wireframe colour resolves from — the central orb, driven by
   * {@link SceneMode}, always sets this. Phase 95: OPTIONAL so a mini-orb target can
   * set `color` instead (its fixed subsystem tint is never one of the five shared
   * state tokens). `orbLayer.ts`'s `update()` prefers `colorToken` when both are set. */
  colorToken?: SceneColorToken;
  /** Direct hex colour override, used when `colorToken` is absent (mini-orbs). */
  color?: string;
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
/**
 * Task B1 (Velín-D retune): `noiseAmp`/`noiseSpeed`/`glow` below now fold in the
 * Velín-D `ORB_MOTION` targets directly (amp/speed/glow), and `pulseSpeed` is
 * derived from its `breath` value as `1 / breath` — a LONGER breath (a calmer,
 * more patient cadence) is a SMALLER `pulseSpeed`, never the reverse. `intensity`,
 * `rotationSpeed`, `pulseAmp`, `colorToken`/`color` and `rings` are untouched by
 * this task (motion-only retune; geometry/placement/shaders are later tasks).
 * SceneMode → ORB_MOTION mapping used here: `thinking`→thinking, `streaming`/
 * `tool`→working (bezi), `waiting-approval`→await (ceka), `idle`→idle. `speaking`
 * (turn done, orb still "talking") maps to the report/hlaseni target — closest in
 * spirit to a completed-turn read-out. `listening` and `error` aren't in the
 * Velín-D table; both keep their prior *relative* offset from `idle` (still a
 * notch more awake / still sharp-and-frozen) recomputed against the new idle
 * baseline, so their place in the mode ladder is preserved.
 */
const BASE: Record<SceneMode, OrbTarget> = {
  // Dormant: calm accent, full presence, slow drift, gentle breathing.
  // Velín-D idle {amp .05, speed .18, glow .5, breath 1.0} → pulseSpeed 1/1.0.
  idle: {
    colorToken: "accent",
    intensity: 0.9,
    noiseAmp: 0.05,
    noiseSpeed: 0.18,
    rotationSpeed: 0.05,
    pulseAmp: 0,
    pulseSpeed: 1 / 1.0,
    glow: 0.5,
    rings: 0,
  },
  // Composing (operator typing): one notch more awake — not in the Velín-D table,
  // so it keeps its prior offset above idle (amp/speed/glow deltas from the old
  // idle values), recomputed against the new idle baseline. Not a jarring warm
  // "recording" cue; text input has no privacy risk.
  listening: {
    colorToken: "accent",
    intensity: 0.95,
    noiseAmp: 0.09, // 0.05 + (old 0.12 − old idle 0.08)
    noiseSpeed: 0.32, // 0.18 + (old 0.32 − old idle 0.18)
    rotationSpeed: 0.09,
    pulseAmp: 0,
    pulseSpeed: 1 / 0.95, // a touch faster breath than idle
    glow: 0.57, // 0.5 + (old 0.62 − old idle 0.55)
    rings: 0,
  },
  // Reasoning / dispatching before the first token: shifts to the run (working) hue
  // — the idle→working change reads as a colour transition, not a brightness drop —
  // churns faster, rings up.
  // Velín-D thinking {amp .17, speed .95, glow .82, breath .7} → pulseSpeed 1/.7.
  thinking: {
    colorToken: "run",
    intensity: 0.95,
    noiseAmp: 0.17,
    noiseSpeed: 0.95,
    rotationSpeed: 0.16,
    pulseAmp: 0.05,
    pulseSpeed: 1 / 0.7,
    glow: 0.82,
    rings: 1,
  },
  // Tokens arriving: run colour, fastest flow. Energy (below) drives the pulse.
  // Velín-D working/bezi {amp .15, speed .85, glow .78, breath .75} → pulseSpeed 1/.75.
  streaming: {
    colorToken: "run",
    intensity: 1,
    noiseAmp: 0.15,
    noiseSpeed: 0.85,
    rotationSpeed: 0.22,
    pulseAmp: 0,
    pulseSpeed: 1 / 0.75,
    glow: 0.78,
    rings: 0.4,
  },
  // A voice reply speaking (Phase 119b): derived from `streaming` — the turn is
  // done but the orb is still "talking" — with a distinct **ok** hue (visibly
  // different from streaming's run) and a steady speech-cadence pulse, so a spoken
  // reply reads as its own state, not just "still streaming". Not in the Velín-D
  // table directly; mapped to report/hlaseni {amp .085, speed .42, glow .68,
  // breath .9} — a completed turn being read out is the report state.
  speaking: {
    colorToken: "ok",
    intensity: 1,
    noiseAmp: 0.085,
    noiseSpeed: 0.42,
    rotationSpeed: 0.2,
    pulseAmp: 0.1,
    pulseSpeed: 1 / 0.9,
    glow: 0.68,
    rings: 0.3,
  },
  // Mid-turn agent dispatch: run (working) hue + a pronounced pulse and rings.
  // Velín-D groups `tool` with `streaming` under working/bezi (same amp/speed/glow).
  tool: {
    colorToken: "run",
    intensity: 1,
    noiseAmp: 0.15,
    noiseSpeed: 0.85,
    rotationSpeed: 0.15,
    pulseAmp: 0.16,
    pulseSpeed: 1 / 0.75,
    glow: 0.78,
    rings: 1,
  },
  // A run parked on the operator's decision: warn (amber) colour, present but calm
  // — a patient, non-urgent cadence (the SLOWEST breath in the table), visibly
  // distinct from error's red.
  // Velín-D await/ceka {amp .05, speed .16, glow .6, breath 1.35} → pulseSpeed 1/1.35.
  "waiting-approval": {
    colorToken: "warn",
    intensity: 0.85,
    noiseAmp: 0.05,
    noiseSpeed: 0.16,
    rotationSpeed: 0.05,
    pulseAmp: 0.05,
    pulseSpeed: 1 / 1.35,
    glow: 0.6,
    rings: 0,
  },
  // The turn errored: bad colour, sharp, nearly frozen. Not in the Velín-D table
  // (an alert state, not a breathing one) — values kept as before.
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

/**
 * A subsystem MINI-orb's per-state visual target (phase 95) — the reuse of the
 * central orb's {@link OrbTarget} contract, but tinted to the subsystem's fixed
 * registry `color` (never a state token) and driven by its {@link SubsystemState}
 * rather than the conversational {@link SceneMode}. It mirrors the retired SVG web's
 * per-state semantics through colour/brightness/pulse (NEVER a flat opacity fade —
 * the phase-93 principle):
 *
 *  - `klid`  — idle: dimmer brightness + glow, static save a barely-there idle breath
 *              (so it still reads alive, like the central orb, not switched off);
 *  - `bezi`  — working: full brightness, a gentle in-place pulse;
 *  - `hlaseni` — report ready: full brightness, calm (no state pulse) — the report is
 *              handled, nothing urgent (the overlay's ok-tone badge carries the rest);
 *  - `ceka`  — awaiting a decision: full brightness, a stronger + faster pulse so it
 *              reads louder than `bezi` at a glance (the overlay's warn badge too).
 *
 * `rings` is always 0 — the halo layer is the central orb's alone. Reduced motion is
 * honoured downstream in {@link OrbLayer.update} (it zeroes the pulse and damps noise/
 * rotation), so this target is the full-motion intent.
 */
/**
 * Task B1 (Velín-D retune): same amp→noiseAmp/speed→noiseSpeed/glow→glow/
 * breath→`1/breath` pulseSpeed mapping as `BASE` above, using the matching
 * Velín-D entries (`idle/klid`, `working/bezi`, `report/hlaseni`, `await/ceka`).
 * `idle/klid`'s table entry has no `breath` value; it reuses idle's 1.0 (same
 * calm cadence as the central orb's idle) for consistency with the rest of the
 * ladder. `intensity`/`rotationSpeed`/`pulseAmp` are untouched (not in the table).
 */
const MINI_BASE: Record<SubsystemState, Omit<OrbTarget, "color">> = {
  // Idle: dim, low glow, near-static — only the shared idle breath keeps it alive.
  // Velín-D idle/klid {amp .05, speed .18, glow .5} → pulseSpeed 1/1.0 (idle's breath).
  klid: {
    intensity: 0.5,
    noiseAmp: 0.05,
    noiseSpeed: 0.18,
    rotationSpeed: 0.05,
    pulseAmp: 0.02,
    pulseSpeed: 1 / 1.0,
    glow: 0.5,
    rings: 0,
  },
  // Working: full presence, a gentle breathing pulse.
  // Velín-D working/bezi {amp .15, speed .85, glow .78, breath .75} → pulseSpeed 1/.75.
  bezi: {
    intensity: 0.95,
    noiseAmp: 0.15,
    noiseSpeed: 0.85,
    rotationSpeed: 0.12,
    pulseAmp: 0.08,
    pulseSpeed: 1 / 0.75,
    glow: 0.78,
    rings: 0,
  },
  // Report ready: full presence, calm (only the idle breath) — nothing urgent.
  // Velín-D report/hlaseni {amp .085, speed .42, glow .68, breath .9} → pulseSpeed 1/.9.
  hlaseni: {
    intensity: 0.95,
    noiseAmp: 0.085,
    noiseSpeed: 0.42,
    rotationSpeed: 0.08,
    pulseAmp: 0.02,
    pulseSpeed: 1 / 0.9,
    glow: 0.68,
    rings: 0,
  },
  // Awaiting a decision: full presence, a louder pulse but the SLOWEST breath in
  // the table — a patient, non-urgent cadence (louder ≠ faster).
  // Velín-D await/ceka {amp .05, speed .16, glow .6, breath 1.35} → pulseSpeed 1/1.35.
  ceka: {
    intensity: 1,
    noiseAmp: 0.05,
    noiseSpeed: 0.16,
    rotationSpeed: 0.14,
    pulseAmp: 0.16,
    pulseSpeed: 1 / 1.35,
    glow: 0.6,
    rings: 0,
  },
};

/** The mini-orb target for a subsystem's registry `color` + live `state`. */
export function miniOrbTarget(color: string, state: SubsystemState): OrbTarget {
  return { ...MINI_BASE[state], color };
}
