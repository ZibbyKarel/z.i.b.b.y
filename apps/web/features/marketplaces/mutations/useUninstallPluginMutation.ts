import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { invalidateMarketplaces } from "./invalidateMarketplaces";

/** Uninstall one plugin. */
export function useUninstallPluginMutation() {
  const queryClient = useQueryClient();
  return apiClient.marketplaces.uninstallPlugin.useMutation({
    onSuccess: () => invalidateMarketplaces(queryClient),
  });
}
