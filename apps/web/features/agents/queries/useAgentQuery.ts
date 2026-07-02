import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Cache key for one agent's detail. Prefix-nested under the `["agents"]` list
 * family, so the mutations' existing list invalidation refreshes the detail too.
 */
export function getAgentQueryKey(id: string) {
  return ["agents", "detail", id] as const;
}

/** One agent from `GET /api/agents/:id` — backs the `/agents/:id` detail page. */
export function useAgentQuery(id: string) {
  return apiClient.agents.getAgent.useQuery({
    queryKey: getAgentQueryKey(id),
    queryData: { params: { id } },
    retry: false,
    select: selectApiResponseBody,
  });
}
