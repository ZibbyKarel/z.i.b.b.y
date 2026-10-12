import type { DashboardApproval } from "../approvals/approval";
import { gateTitleKey } from "../approvals/approval";
import { useWorkflowsQuery } from "../workflows";
import { useRunArtifactQuery } from "./queries/useRunArtifactQuery";
import type { RunView } from "./run";

/** The run fields a checkpoint needs to locate the finished phase's output. */
export type CheckpointRun = Pick<RunView, "kind" | "runId" | "owner" | "stageRuns">;

/**
 * The artifact a workflow stage checkpoint asks the operator to review: the
 * `produces` of the phase that just finished (the last recorded stage — a revise
 * re-runs it and appends it again). Null when it isn't a checkpoint or the phase
 * declares no output.
 */
export function useCheckpointArtifact(
  approval: DashboardApproval | undefined,
  run: CheckpointRun | undefined,
): string | null {
  const isCheckpoint =
    approval !== undefined &&
    run?.kind === "workflow" &&
    gateTitleKey(approval) === "stage-approval";
  const { data: workflows } = useWorkflowsQuery();
  const phaseId = run?.stageRuns?.at(-1)?.phaseId;
  const produces = isCheckpoint
    ? workflows?.find((w) => w.id === run.owner)?.phases.find((p) => p.id === phaseId)?.produces
    : undefined;
  const { data } = useRunArtifactQuery(run?.runId ?? "", produces ?? "", Boolean(produces));
  return produces ? (data?.content ?? null) : null;
}
