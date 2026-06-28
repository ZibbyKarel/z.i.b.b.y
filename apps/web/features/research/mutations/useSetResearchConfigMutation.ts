import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getResearchConfigQueryKey } from "../queries/useResearchConfigQuery";

/** Replace the operator research config (`PUT /api/research/config`); refreshes it on success. */
export const useSetResearchConfigMutation = makeInvalidatingMutation(
  apiClient.research.putConfig.useMutation,
  getResearchConfigQueryKey,
);
