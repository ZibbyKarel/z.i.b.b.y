import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { taskRunsRootKey } from "../queries/keys";

/**
 * Queue an operator message (`POST /api/tasks/runs/:runId/messages`); it is delivered
 * into the addressed phase's context when that phase next starts. Refreshes the feed.
 */
export const useSendTaskRunMessageMutation = makeInvalidatingMutation(
  apiClient.taskRuns.sendTaskRunMessage.useMutation,
  () => taskRunsRootKey,
);
