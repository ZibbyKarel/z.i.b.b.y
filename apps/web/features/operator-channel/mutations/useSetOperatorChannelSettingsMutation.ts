import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getOperatorChannelSettingsQueryKey } from "../queries/useOperatorChannelSettingsQuery";
import { getOperatorChannelStatusQueryKey } from "../queries/useOperatorChannelStatusQuery";

/** Replace the operator-channel settings (`PUT`); refreshes settings and status. */
export function useSetOperatorChannelSettingsMutation() {
  const qc = useQueryClient();
  return apiClient.operatorChannel.setOperatorChannelSettings.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getOperatorChannelSettingsQueryKey() });
      void qc.invalidateQueries({ queryKey: getOperatorChannelStatusQueryKey() });
    },
  });
}
