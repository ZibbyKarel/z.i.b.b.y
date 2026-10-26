import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getMarketplacesQueryKey } from "./useMarketplacesQuery";

export function getMarketplaceQueryKey(id: string) {
  return [...getMarketplacesQueryKey(), id] as const;
}

/** One marketplace with its plugin catalog (`GET /api/marketplaces/:id`). */
export function useMarketplaceQuery(id: string) {
  return apiClient.marketplaces.getMarketplace.useQuery({
    queryKey: getMarketplaceQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
