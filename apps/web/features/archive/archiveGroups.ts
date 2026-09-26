import type { DepartmentId } from "@zibby/contracts";
import { NO_DEPARTMENT } from "@zibby/contracts";
import type { RunView } from "../runs/run";
import { type OwnerDepartmentMaps, runDepartmentId } from "../departments/useOwnerDepartment";

/**
 * Pure department-attribution logic for the `/archiv` page (F2,
 * `docs/plans/hud2chat-F2-archive.md`, decision D3/D8). Search, department filtering,
 * and grouping/time-bucketing now run server-side (`TaskRunsService.listArchivedTaskRuns`/
 * `getArchiveCounts`) so the archive reaches every archived run, not just whatever page
 * the frontend has loaded — this module only keeps the client-side join a row still
 * needs to RENDER its department name/colour dot.
 */

// Re-exported so existing importers (`ArchiveDepartmentFilter.tsx`) keep resolving it from
// here; the canonical definition lives in contracts now (both the API's filtering and the
// web's rendering need the exact same security).
export { NO_DEPARTMENT };
export type ArchiveDepartmentFilterId = DepartmentId | typeof NO_DEPARTMENT;

/** The department-filter identity of a run — its real department, or the explicit
 * {@link NO_DEPARTMENT} bucket (D8). Used for each row's display attribution
 * (`Screen.tsx`'s `departmentDisplay`); filtering/counting itself is server-side. */
export function archiveDepartmentFilterId(
  run: Pick<RunView, "kind" | "owner">,
  ownerMaps: OwnerDepartmentMaps,
): ArchiveDepartmentFilterId {
  return runDepartmentId(run, ownerMaps) ?? NO_DEPARTMENT;
}
