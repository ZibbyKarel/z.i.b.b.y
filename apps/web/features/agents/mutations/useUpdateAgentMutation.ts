import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAgentsQueryKey } from "../queries/useAgentsQuery";

/** Patch an agent (`PATCH /api/agents/:id`); refreshes the catalog on success. */
export const useUpdateAgentMutation = makeInvalidatingMutation(
  apiClient.agents.updateAgent.useMutation,
  getAgentsQueryKey,
);
