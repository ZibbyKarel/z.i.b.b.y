import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAiProvidersQueryKey } from "../queries/useAiProvidersQuery";

/** Store the OpenAI API key (`PUT /api/ai-providers/openai`); refreshes the status. */
export const useSetOpenAiKeyMutation = makeInvalidatingMutation(
  apiClient.aiProviders.setOpenAiKey.useMutation,
  getAiProvidersQueryKey,
);
