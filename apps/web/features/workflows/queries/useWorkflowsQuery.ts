import type { Workflow as ContractWorkflow } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import type { Workflow } from "../../../domain";

/** Shared cache key for the workflow list; exported so mutations can invalidate it. */
export function getWorkflowsQueryKey() {
  return ["workflows"] as const;
}

/**
 * Map the contract `Workflow` onto the dashboard's domain `Workflow`: derive the
 * display-only `file` path, and drop the phase `id` the UI
 * doesn't render. `lastRun`/`lastState` are run-history fields the definition
 * doesn't carry — defaulted here until the run list feeds them.
 */
function selectWorkflows(response: { body: ContractWorkflow[] }): Workflow[] {
  return response.body.map((p) => ({
    id: p.id,
    name: p.name ?? p.id,
    lastRun: "—",
    lastState: "done",
    desc: p.desc ?? "",
    file: `~/zibby/workflows/${p.id}.workflow.md`,
    phases: p.phases.map((ph) => ({
      id: ph.id,
      type: ph.type,
      workflow: ph.workflow,
      agent: ph.agent,
      consumes: ph.consumes,
      produces: ph.produces,
      model: ph.model,
      thinking: ph.thinking,
      commands: ph.commands,
      loop: ph.loop,
      approval: ph.approval,
      qualify: ph.qualify,
    })),
    outputs: p.outputs,
    avatar: p.avatar,
    department: p.department,
    complexity: p.complexity,
    budget: p.budget,
    project: p.project,
  }));
}

/** Live workflow catalog from `GET /api/workflows`. */
export function useWorkflowsQuery() {
  return apiClient.workflows.listWorkflows.useQuery({
    queryKey: getWorkflowsQueryKey(),
    select: selectWorkflows,
  });
}
