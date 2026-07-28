import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { taskRunsRootKey } from "../queries/keys";

/**
 * Resume a run via `POST /api/tasks/runs/:runId/resume`; refreshes the feed on
 * success. Phase 49: for an errored/interrupted AGENT run this RE-RUNS it — the
 * response body is the NEW run (with `--resume` when a session id was captured,
 * else a fresh run of the same task), so the caller navigates to `body.runId`.
 * (The parked pipeline/goal resume returns the same run, resumed in place.)
 */
export function useResumeTaskRunMutation() {
  const qc = useQueryClient();
  return apiClient.taskRuns.resumeTaskRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: taskRunsRootKey }),
  });
}
