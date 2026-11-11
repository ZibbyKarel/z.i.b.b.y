import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { taskRunsRootKey } from "../queries/keys";

/**
 * Hand a run's task over to another agent/workflow/department
 * (`POST /api/tasks/runs/:runId/handover`); the body is the NEW task's view.
 */
export const useHandoverTaskRunMutation = makeInvalidatingMutation(
  apiClient.taskRuns.handoverTaskRun.useMutation,
  () => taskRunsRootKey,
);
