import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getWorkflowsQueryKey } from "../queries/useWorkflowsQuery";

/** Partially update a workflow (`PATCH /api/workflows/:id`); refreshes the list. */
export const useUpdateWorkflowMutation = makeInvalidatingMutation(
  apiClient.workflows.updateWorkflow.useMutation,
  getWorkflowsQueryKey,
);
