import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getMarketplaceSkillsQueryKey() {
  return ["marketplace-skills"] as const;
}

/** Skills of installed marketplace plugins (`GET /api/marketplace-skills`) — feeds the `/` picker. */
export function useMarketplaceSkillsQuery() {
  return apiClient.marketplaces.listMarketplaceSkills.useQuery({
    queryKey: getMarketplaceSkillsQueryKey(),
    select: selectApiResponseBody,
  });
}
