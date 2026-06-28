import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAgentsQueryKey } from "../queries/useAgentsQuery";

/** Delete an agent (`DELETE /api/agents/:id`); refreshes the catalog on success. */
export const useDeleteAgentMutation = makeInvalidatingMutation(
  apiClient.agents.deleteAgent.useMutation,
  getAgentsQueryKey,
);
