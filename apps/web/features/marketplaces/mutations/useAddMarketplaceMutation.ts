import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { invalidateMarketplaces } from "./invalidateMarketplaces";

/** Connect a marketplace (`POST /api/marketplaces`). */
export function useAddMarketplaceMutation() {
  const queryClient = useQueryClient();
  return apiClient.marketplaces.addMarketplace.useMutation({
    onSuccess: () => invalidateMarketplaces(queryClient),
  });
}
