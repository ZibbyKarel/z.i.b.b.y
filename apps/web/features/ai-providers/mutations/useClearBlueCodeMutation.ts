import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getAiProvidersQueryKey } from "../queries/useAiProvidersQuery";

/** Remove the BlueCode config (`DELETE /api/ai-providers/bluecode`); refreshes status and engines. */
export const useClearBlueCodeMutation = makeInvalidatingMutation(
  apiClient.aiProviders.clearBlueCode.useMutation,
  getAiProvidersQueryKey,
);
