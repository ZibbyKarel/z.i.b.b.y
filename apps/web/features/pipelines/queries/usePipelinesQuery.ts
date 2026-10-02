import type { Pipeline as ContractPipeline } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import type { Pipeline } from "../../../domain";

/** Shared cache key for the pipeline list; exported so mutations can invalidate it. */
export function getPipelinesQueryKey() {
  return ["pipelines"] as const;
}

/**
 * Map the contract `Pipeline` onto the dashboard's domain `Pipeline`: derive the
 * display-only `file` path, and drop the phase `id` the UI
 * doesn't render. `lastRun`/`lastState` are run-history fields the definition
 * doesn't carry — defaulted here until the run list feeds them.
 */
function selectPipelines(response: { body: ContractPipeline[] }): Pipeline[] {
  return response.body.map((p) => ({
    id: p.id,
    name: p.name ?? p.id,
    lastRun: "—",
    lastState: "done",
    desc: p.desc ?? "",
    file: `~/zibby/pipelines/${p.id}.pipeline.md`,
    phases: p.phases.map((ph) => ({
      id: ph.id,
      type: ph.type,
      pipeline: ph.pipeline,
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

/** Live pipeline catalog from `GET /api/pipelines`. */
export function usePipelinesQuery() {
  return apiClient.pipelines.listPipelines.useQuery({
    queryKey: getPipelinesQueryKey(),
    select: selectPipelines,
  });
}
