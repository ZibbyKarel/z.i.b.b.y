import type { SubsystemId, SubsystemState } from "@zibby/contracts";
import type { IconName, OrbState } from "@zibby/design-system";

/**
 * The shared visual vocabulary of a subsystem: which immersive orb state its
 * contract state reads as, and which glyph carries its identity.
 *
 * Lives at the feature root (not inside `components/SubsystemWeb/` or the chat
 * feature) because BOTH renderers of a subsystem's identity need it and neither
 * owns the other: `chat/components/SubsystemOrbMap` draws the map node, and
 * `components/SubsystemDrawer/SubsystemDrawer` draws the detail header. The
 * Velín-D design treats those two as the SAME object — you click an orb on the
 * map and its header carries the same orb, same glyph, same state — so the two
 * must read from one table or they silently drift apart.
 *
 * Direction matters: chat already imports from this feature (the drawer, the
 * queries), so chat → subsystems keeps the existing edge and the madge cycle
 * guard (`pnpm check:deps`) stays green. The reverse would not.
 */

/** English `SubsystemState` (contracts) → immersive `OrbState` (DS).
 *
 * `error` maps to the DS `incident` state — a failed owned run, distinct from
 * a successful `report`. `thinking` has no subsystem equivalent; it belongs
 * to the core orb only. */
export const SUBSYSTEM_ORB_STATE: Record<SubsystemState, OrbState> = {
  idle: "idle",
  running: "working",
  report: "report",
  waiting: "await",
  error: "incident",
};

/** One glyph per subsystem identity — verified present in the DS icon set
 * (`libs/design-system/src/assets/icons`). */
export const SUBSYSTEM_GLYPH: Record<SubsystemId, IconName> = {
  forge: "code",
  herald: "link",
  sentinel: "shield",
  scout: "compass",
  maestro: "checkpoint",
  beacon: "warn",
  puls: "pulse",
  loom: "search",
  codex: "brain",
  ledger: "dollar",
  hearth: "coffee",
};
