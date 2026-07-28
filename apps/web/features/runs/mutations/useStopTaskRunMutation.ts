import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { taskRunsRootKey } from "../queries/keys";

/**
 * Stop a running task run — agent, pipeline, or goal (Phase 43 generalized the
 * backend beyond agent-only) — via `POST /api/tasks/runs/:runId/stop`; refreshes
 * the feed on success. The backend resolves the run's kind and rejects a kind/state
 * that has no live process to stop (409), surfaced to the caller as a mutation error.
 */
export function useStopTaskRunMutation() {
  const qc = useQueryClient();
  return apiClient.taskRuns.stopTaskRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: taskRunsRootKey }),
  });
}
