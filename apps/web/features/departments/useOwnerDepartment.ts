import type { DepartmentId } from "@zibby/contracts";
import { useWorkflowsQuery } from "../workflows";
import type { RunView } from "../runs/run";

/**
 * The id→department lookup a run's owner attribution is joined through — built
 * once per render from the already-fetched workflow catalog (the SAME list
 * `RosterTab` and `AktivitaTab` fetch for this drawer; see
 * {@link useOwnerDepartmentMaps}'s doc comment for why this is a client join,
 * not a new endpoint).
 */
export interface OwnerDepartmentMaps {
  workflowDepartment: Map<string, DepartmentId>;
}

/**
 * Shared run→department join (extracted from `AktivitaTab`'s original inline
 * `ownedWorkflowIds` Set — F2, `docs/plans/hud2chat-F2-archive.md`,
 * decision D8) so the `/archiv` page's "group by department" mode and the
 * department drawer's Aktivita tab read the SAME attribution instead of two
 * copies drifting apart.
 *
 * D8: only a `workflow` run ever carries a department — it comes from
 * `Workflow.department` on the run's owning definition, joined by id
 * (`run.owner`). An `agent` or `goal` run has NO department at all (there is no
 * `department` field on an agent/goal definition) — callers must treat
 * `runDepartmentId(...) === null` as an explicit "bez oddělení" bucket, never
 * hide those runs.
 *
 * Client-side join over the already-fetched catalog (`useWorkflowsQuery`) — no
 * new endpoint, no `department` query param on the unified runs feed,
 * mirroring `AktivitaTab`'s original reasoning: the catalog is small, already
 * cached, and already fetched by sibling drawer tabs (`RosterTab`), so a
 * second endpoint would only pay for itself once the catalog got too large to
 * fetch in full, which it isn't.
 */
export function useOwnerDepartmentMaps(): OwnerDepartmentMaps {
  const { data: workflows = [] } = useWorkflowsQuery();

  const workflowDepartment = new Map<string, DepartmentId>();
  for (const p of workflows) if (p.department) workflowDepartment.set(p.id, p.department);

  return { workflowDepartment };
}

/**
 * The department a single run is attributed to, or `null` when it has none —
 * either because it's an `agent`/`goal` run (no department concept applies at
 * all, D8) or because its owning workflow has no `department` set. Both
 * cases are indistinguishable to a caller and BOTH belong in an explicit "bez
 * oddělení" group — never filtered out silently.
 */
export function runDepartmentId(
  run: Pick<RunView, "kind" | "owner">,
  maps: OwnerDepartmentMaps,
): DepartmentId | null {
  if (run.kind === "workflow") return maps.workflowDepartment.get(run.owner) ?? null;
  return null;
}
