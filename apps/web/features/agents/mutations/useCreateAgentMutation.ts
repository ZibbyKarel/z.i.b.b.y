import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAgentsQueryKey } from "../queries/useAgentsQuery";

/** Create an agent (`POST /api/agents`); refreshes the catalog on success. */
export const useCreateAgentMutation = makeInvalidatingMutation(
  apiClient.agents.createAgent.useMutation,
  getAgentsQueryKey,
);
