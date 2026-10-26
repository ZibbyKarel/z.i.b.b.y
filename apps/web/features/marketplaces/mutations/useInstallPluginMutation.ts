import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { invalidateMarketplaces } from "./invalidateMarketplaces";

/** Install one plugin. */
export function useInstallPluginMutation() {
  const queryClient = useQueryClient();
  return apiClient.marketplaces.installPlugin.useMutation({
    onSuccess: () => invalidateMarketplaces(queryClient),
  });
}
