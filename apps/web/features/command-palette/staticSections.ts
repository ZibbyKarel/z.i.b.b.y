/**
 * ROUTE-MAP §3's `/system/settings/<section>` tabs — a static list, not a query
 * (settings sections are code, not data). Kept in sync by hand with ZB-11 as it
 * lands each section's real screen; a section here that ZB-11 hasn't shipped yet
 * still resolves (`/system/settings/<section>` 404s until then, same posture as
 * every other freshly-added-route cast elsewhere in the app).
 */
export const SETTINGS_SECTIONS = [
  "general",
  "automations",
  "coo",
  "activity",
  "runtime",
  "machine",
  "status",
  "appearance",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

/** ROUTE-MAP §1's `/policy/gates?section=<s>` tabs — same static posture. */
export const GATE_SECTIONS = [
  "floor",
  "global",
  "per-project",
  "per-agent",
  "handoff",
  "signals",
  "mandate",
] as const;

export type GateSectionId = (typeof GATE_SECTIONS)[number];
