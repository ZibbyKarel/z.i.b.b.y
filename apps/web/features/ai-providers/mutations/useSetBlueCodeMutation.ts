import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAiProvidersQueryKey } from "../queries/useAiProvidersQuery";

/**
 * Save BlueCode (`PUT /api/ai-providers/bluecode`) — or refresh its model list when the
 * body has no `apiKey`. The providers key prefixes the engines key, so both refresh.
 */
export const useSetBlueCodeMutation = makeInvalidatingMutation(
  apiClient.aiProviders.setBlueCode.useMutation,
  getAiProvidersQueryKey,
);
