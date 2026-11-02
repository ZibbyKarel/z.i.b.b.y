import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAiProvidersQueryKey } from "../queries/useAiProvidersQuery";

/** Remove the OpenAI API key (`DELETE /api/ai-providers/openai`); refreshes the status. */
export const useClearOpenAiKeyMutation = makeInvalidatingMutation(
  apiClient.aiProviders.clearOpenAiKey.useMutation,
  getAiProvidersQueryKey,
);
