import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSystemConfigQueryKey } from "../queries/useSystemConfigQuery";

/** Replace the runtime system config (`PUT /api/system/config`); refreshes it on success. */
export const useSetSystemConfigMutation = makeInvalidatingMutation(
  apiClient.system.putConfig.useMutation,
  getSystemConfigQueryKey,
);
