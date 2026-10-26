import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { invalidateMarketplaces } from "./invalidateMarketplaces";

/** Install every plugin of a marketplace. */
export function useInstallAllPluginsMutation() {
  const queryClient = useQueryClient();
  return apiClient.marketplaces.installAllPlugins.useMutation({
    onSuccess: () => invalidateMarketplaces(queryClient),
  });
}
