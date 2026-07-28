import type { SubsystemId } from "@zibby/contracts";
import { NO_SUBSYSTEM } from "@zibby/contracts";
import type { RunView } from "../runs/run";
import { type OwnerSubsystemMaps, runSubsystemId } from "../subsystems/useOwnerSubsystem";

/**
 * Pure subsystem-attribution logic for the `/archiv` page (F2,
 * `docs/plans/hud2chat-F2-archive.md`, decision D3/D8). Search, subsystem filtering,
 * and grouping/time-bucketing now run server-side (`TaskRunsService.listArchivedTaskRuns`/
 * `getArchiveCounts`) so the archive reaches every archived run, not just whatever page
 * the frontend has loaded — this module only keeps the client-side join a row still
 * needs to RENDER its subsystem name/colour dot.
 */

// Re-exported so existing importers (`ArchiveSubsystemFilter.tsx`) keep resolving it from
// here; the canonical definition lives in contracts now (both the API's filtering and the
// web's rendering need the exact same sentinel).
export { NO_SUBSYSTEM };
export type ArchiveSubsystemFilterId = SubsystemId | typeof NO_SUBSYSTEM;

/** The subsystem-filter identity of a run — its real subsystem, or the explicit
 * {@link NO_SUBSYSTEM} bucket (D8). Used for each row's display attribution
 * (`Screen.tsx`'s `subsystemDisplay`); filtering/counting itself is server-side. */
export function archiveSubsystemFilterId(
  run: Pick<RunView, "kind" | "owner">,
  ownerMaps: OwnerSubsystemMaps,
): ArchiveSubsystemFilterId {
  return runSubsystemId(run, ownerMaps) ?? NO_SUBSYSTEM;
}
