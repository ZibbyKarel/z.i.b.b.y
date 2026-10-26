import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Root cache key of the marketplaces family — the list and every detail live under it. */
export function getMarketplacesQueryKey() {
  return ["marketplaces"] as const;
}

/** The connected marketplaces from `GET /api/marketplaces`. */
export function useMarketplacesQuery() {
  return apiClient.marketplaces.listMarketplaces.useQuery({
    queryKey: getMarketplacesQueryKey(),
    select: selectApiResponseBody,
  });
}
