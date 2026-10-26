import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { invalidateMarketplaces } from "./invalidateMarketplaces";

/** Disconnect a marketplace (`DELETE /api/marketplaces/:id`). */
export function useRemoveMarketplaceMutation() {
  const queryClient = useQueryClient();
  return apiClient.marketplaces.removeMarketplace.useMutation({
    onSuccess: () => invalidateMarketplaces(queryClient),
  });
}
