import { z } from "zod";

/**
 * A `qualify` phase's machine-readable outcome, emitted by the phase agent as a
 * `<verdict>…</verdict>` tag in its produced artifact and parsed by the runner.
 * - `pass`  — work is accepted; the cursor advances.
 * - `gap`   — incomplete (missing acceptance criteria) → back-edge to `loop.to`.
 * - `drift` — wrong direction → back-edge to `loop.driftTo` (re-plan).
 * Only `pass` advances; `gap`/`drift`/absent all take the back-edge (fail-closed).
 */
export const StageVerdictSchema = z.enum(["pass", "gap", "drift"]);
export type StageVerdict = z.infer<typeof StageVerdictSchema>;
