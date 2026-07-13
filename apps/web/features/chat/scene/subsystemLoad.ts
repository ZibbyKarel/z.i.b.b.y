/**
 * Task B4 (Velín-D retune) — pure active-run tally per subsystem, feeding the
 * per-subsystem orbital task-particles (`orbitFieldLayer.ts`): "each light = one
 * processing task". No `three` import — same posture as `particle-mapping.ts`
 * and `clusterGeometry.ts`, so the count derivation is unit-tested independent
 * of rendering.
 *
 * Reuses `particle-mapping.ts`'s own `resolveEventOwner` (the SAME
 * pipeline-runs-only owner resolution the handoff-flight particles already use)
 * rather than re-deriving the `run.owner → pipeline → ownerSubsystem` lookup —
 * a synthetic `{ scope: "pipeline-runs", runId }` event is enough to drive it
 * per run, so the two features can never silently disagree about who owns a run.
 */
import type { SubsystemId } from "@zibby/contracts";
import type { Pipeline } from "../../../domain";
import { resolveEventOwner } from "../../subsystems/components/SubsystemWeb/particle-mapping";
import type { RunView } from "../../runs/run";

/** The bounded pool size `orbitFieldLayer.ts` allocates per subsystem — also the
 * cap `activeRunsBySubsystem` clamps every subsystem's count to, so a flood of
 * concurrent runs can never grow the (fixed) orbiter pool. */
export const MAX_ORBITERS = 6;

/** A `RunView.status` that counts as "actively processing" for the orbit field —
 * `running` (in flight) and `queued` (waiting for a concurrency slot, still a
 * real outstanding task). Every other status (terminal, parked, held, …) is not
 * currently occupying a worker and draws no orbiter. */
const ACTIVE_STATUSES = new Set<RunView["status"]>(["running", "queued"]);

/**
 * Tally of currently-active runs per owning subsystem, capped at
 * {@link MAX_ORBITERS} per subsystem. Only `pipeline` runs can resolve an owner
 * (mirrors `particle-mapping.ts`'s own attribution constraint — agent/goal runs
 * carry no `ownerSubsystem` path); an unresolvable run contributes to no
 * subsystem. A subsystem with zero active runs is simply absent from the
 * returned map (never an explicit `0`).
 */
export function activeRunsBySubsystem(
  runs: readonly RunView[],
  pipelines: readonly Pipeline[],
): Partial<Record<SubsystemId, number>> {
  const counts: Partial<Record<SubsystemId, number>> = {};
  for (const run of runs) {
    if (!ACTIVE_STATUSES.has(run.status)) continue;
    const subsystemId = resolveEventOwner(
      { scope: "pipeline-runs", runId: run.runId },
      runs,
      pipelines,
    );
    if (!subsystemId) continue;
    counts[subsystemId] = Math.min((counts[subsystemId] ?? 0) + 1, MAX_ORBITERS);
  }
  return counts;
}
