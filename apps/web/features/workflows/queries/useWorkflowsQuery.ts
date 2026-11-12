import type { Workflow as ContractWorkflow } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import type { Workflow } from "../../../domain";

/** Shared cache key for the workflow list; exported so mutations can invalidate it. */
export function getWorkflowsQueryKey() {
  return ["workflows"] as const;
}

/**
 * Map the contract `Workflow` onto the dashboard's domain `Workflow`: derive the
 * display-only `file` path. `lastRun`/`lastState` are run-history fields the definition
 * doesn't carry — defaulted here until the run list feeds them.
 */
export function selectWorkflows(response: { body: ContractWorkflow[] }): Workflow[] {
  // Spread the whole contract workflow/phase so a new contract field can never be dropped here;
  // only the display-only fields are added.
  return response.body.map((p) => ({
    ...p,
    name: p.name ?? p.id,
    lastRun: "—",
    lastState: "done",
    desc: p.desc ?? "",
    file: `~/zibby/workflows/${p.id}.workflow.md`,
  }));
}

/** Live workflow catalog from `GET /api/workflows`. */
export function useWorkflowsQuery() {
  return apiClient.workflows.listWorkflows.useQuery({
    queryKey: getWorkflowsQueryKey(),
    select: selectWorkflows,
  });
}
