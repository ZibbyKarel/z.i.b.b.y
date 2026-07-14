/**
 * The immersive orb's state vocabulary (English). `state` selects the orb's
 * MOTION (amplitude / noise speed / glow / breathing) and its CHROME color
 * (halo, ping, contact shadow, status label, live connector). The orb BODY color
 * is the caller-supplied identity `hex` — never this palette.
 *
 * `ORB_MOTION` is ported verbatim from the original orb prototype.
 * `ORB_STATE_COLOR` mirrors the ZT / DS state tokens (idle=foreground-faint,
 * working=run, report=ok, await=warn, incident=bad, thinking=accent) as raw hex,
 * because these feed WebGL/canvas/SVG consumers that can't take a CSS var.
 */
export type OrbState = "idle" | "working" | "report" | "await" | "incident" | "thinking";

export interface OrbMotion {
  amp: number;
  speed: number;
  glow: number;
  breath: number;
}

export const ORB_MOTION: Record<OrbState, OrbMotion> = {
  idle: { amp: 0.05, speed: 0.18, glow: 0.5, breath: 1.0 },
  thinking: { amp: 0.17, speed: 0.95, glow: 0.82, breath: 0.7 },
  working: { amp: 0.15, speed: 0.85, glow: 0.78, breath: 0.75 },
  report: { amp: 0.085, speed: 0.42, glow: 0.68, breath: 0.9 },
  await: { amp: 0.05, speed: 0.16, glow: 0.6, breath: 1.35 },
  incident: { amp: 0.02, speed: 0.05, glow: 0.5, breath: 0.14 },
};

export const ORB_STATE_COLOR: Record<OrbState, string> = {
  idle: "#66737f",
  working: "#7aa5f8",
  report: "#3fcf8e",
  await: "#f0b429",
  incident: "#ff6b6b",
  thinking: "#5b8def",
};

export interface OrbStateStyle {
  color: string;
  live: boolean;
}

/** `live` = animated chrome (halo pulse, contact-shadow breathe, connector dash). */
export const ORB_STATE: Record<OrbState, OrbStateStyle> = {
  idle: { color: ORB_STATE_COLOR.idle, live: false },
  working: { color: ORB_STATE_COLOR.working, live: true },
  report: { color: ORB_STATE_COLOR.report, live: true },
  await: { color: ORB_STATE_COLOR.await, live: true },
  incident: { color: ORB_STATE_COLOR.incident, live: true },
  thinking: { color: ORB_STATE_COLOR.thinking, live: true },
};
