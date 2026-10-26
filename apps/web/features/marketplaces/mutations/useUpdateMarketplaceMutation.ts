import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { invalidateMarketplaces } from "./invalidateMarketplaces";

/** Pull newest plugin versions (`POST /api/marketplaces/:id/update`). */
export function useUpdateMarketplaceMutation() {
  const queryClient = useQueryClient();
  return apiClient.marketplaces.updateMarketplace.useMutation({
    onSuccess: () => invalidateMarketplaces(queryClient),
  });
}
