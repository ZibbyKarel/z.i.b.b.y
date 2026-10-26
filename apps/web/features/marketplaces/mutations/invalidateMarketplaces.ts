import type { QueryClient } from "@tanstack/react-query";
import { getMarketplacesQueryKey } from "../queries/useMarketplacesQuery";
import { getMarketplaceSkillsQueryKey } from "../queries/useMarketplaceSkillsQuery";

/** Refresh the list, every marketplace detail (shared key prefix) and the `/` skills. */
export function invalidateMarketplaces(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: getMarketplacesQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getMarketplaceSkillsQueryKey() });
}
