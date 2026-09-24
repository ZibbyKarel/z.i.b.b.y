import type { DepartmentId, DepartmentState } from "@zibby/contracts";
import type { IconName, OrbState } from "@zibby/design-system";

/**
 * The shared visual vocabulary of a department: which immersive orb state its
 * contract state reads as, and which glyph carries its identity.
 *
 * Lives at the feature root (not inside `components/DepartmentWeb/` or the chat
 * feature) because BOTH renderers of a department's identity need it and neither
 * owns the other: `chat/components/DepartmentOrbMap` draws the map node, and
 * `components/DepartmentDrawer/DepartmentDrawer` draws the detail header. The
 * Velín-D design treats those two as the SAME object — you click an orb on the
 * map and its header carries the same orb, same glyph, same state — so the two
 * must read from one table or they silently drift apart.
 *
 * Direction matters: chat already imports from this feature (the drawer, the
 * queries), so chat → departments keeps the existing edge and the madge cycle
 * guard (`pnpm check:deps`) stays green. The reverse would not.
 */

/** English `DepartmentState` (contracts) → immersive `OrbState` (DS).
 *
 * `error` maps to the DS `incident` state — a failed owned run, distinct from
 * a successful `report`. `thinking` has no department equivalent; it belongs
 * to the core orb only. */
export const DEPARTMENT_ORB_STATE: Record<DepartmentState, OrbState> = {
  idle: "idle",
  running: "working",
  report: "report",
  waiting: "await",
  error: "incident",
};

/** One glyph per department identity — verified present in the DS icon set
 * (`libs/design-system/src/assets/icons`). */
export const DEPARTMENT_GLYPH: Record<DepartmentId, IconName> = {
  dev: "code",
  com: "link",
  sec: "shield",
  rnd: "compass",
  rel: "checkpoint",
  inc: "warn",
  ops: "pulse",
  qa: "search",
  knw: "brain",
  fin: "dollar",
  per: "coffee",
};
