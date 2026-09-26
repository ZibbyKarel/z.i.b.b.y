import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getMemoryGraphQueryKey() {
  return ["memory", "graph"] as const;
}

/** The wiki-link graph (`GET /api/memory/graph`). */
export function useMemoryGraphQuery() {
  return apiClient.memory.getGraph.useQuery({
    queryKey: getMemoryGraphQueryKey(),
    select: selectApiResponseBody,
  });
}
