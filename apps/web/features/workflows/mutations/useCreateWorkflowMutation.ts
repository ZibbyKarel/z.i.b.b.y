import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getWorkflowsQueryKey } from "../queries/useWorkflowsQuery";

/** Create a workflow (`POST /api/workflows`); refreshes the list on success. */
export const useCreateWorkflowMutation = makeInvalidatingMutation(
  apiClient.workflows.createWorkflow.useMutation,
  getWorkflowsQueryKey,
);
