import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSystemConfigQueryKey } from "../queries/useSystemConfigQuery";

/** Replace the runtime system config (`PUT /api/system/config`); refreshes it on success. */
export function useSetSystemConfigMutation() {
  const qc = useQueryClient();
  return apiClient.system.putConfig.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getSystemConfigQueryKey() }),
  });
}
