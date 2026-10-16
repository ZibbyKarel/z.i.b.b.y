/**
 * Minion illustration palette — ported from `design/ZibbyCorp/minion-art.js`.
 *
 * INTENTIONAL TOKEN EXCEPTION: this is character art (outline, skin yellows, denim,
 * metal, desk greys, banana), not UI chrome, so it keeps its own fixed palette and
 * does not follow the theme. Everything that carries the live *state* (monitor
 * glow, bubbles, lens, confetti, …) instead uses the DS state-tone CSS vars
 * (`stateToneVar`) so themes apply.
 */

/** Outline ink. */
export const MINION_K = "#111312";
/** The three skin yellows, indexed by `MinionAppearance.skin`. */
export const MINION_SKIN = ["#F6D03C", "#F0C22E", "#F9DC62"] as const;
export const MINION_DENIM = "#3F6EA3";
export const MINION_DENIM_DARK = "#2C4F7A";
export const MINION_METAL = "#B5BAB3";
export const MINION_METAL_DARK = "#7A7F78";
export const MINION_DESK = "#E4E5E1";
export const MINION_PANEL = "#D9DBD6";
export const MINION_PEEL = "#F2C230";
export const MINION_FLESH = "#FBF0C0";
export const MINION_WHITE = "#fff";
export const MINION_PAPER = "#F2F2EE";
export const MINION_SCREEN = "#2A2D2B";
export const MINION_SCREEN_OFF = "#1A1C1B";
export const MINION_GROUND = "#BFC2BC";
export const MINION_MUTED = "#8A8E88";
export const MINION_SOOT = "rgba(17,19,18,.55)";
export const MINION_SHADE = "rgba(17,19,18,.06)";
