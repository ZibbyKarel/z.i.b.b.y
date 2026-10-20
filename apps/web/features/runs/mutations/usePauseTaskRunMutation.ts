import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { taskRunsRootKey } from "../queries/keys";

/**
 * Request a pause (`POST /api/tasks/runs/:runId/pause`): a running workflow finishes
 * its current stage and parks at the next stage boundary. Refreshes the feed.
 */
export const usePauseTaskRunMutation = makeInvalidatingMutation(
  apiClient.taskRuns.pauseTaskRun.useMutation,
  () => taskRunsRootKey,
);
