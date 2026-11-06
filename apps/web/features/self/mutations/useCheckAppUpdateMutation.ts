import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSelfStatusQueryKey } from "../queries/useSelfStatusQuery";

/**
 * Settings → General → Updates' "Check for updates" (`POST
 * /api/self/app-update/check`): the API re-reads the `desktop-v*` GitHub releases
 * past its 24 h cache and returns the fresh self status, which replaces the cached
 * one so the top-bar Upgrade icon and the section update together.
 */
export function useCheckAppUpdateMutation() {
  const queryClient = useQueryClient();
  return apiClient.self.checkAppUpdate.useMutation({
    onSuccess: (response) => {
      queryClient.setQueryData(getSelfStatusQueryKey(), response);
    },
  });
}
