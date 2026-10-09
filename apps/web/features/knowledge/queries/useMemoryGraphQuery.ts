import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getMemoryGraphQueryKey() {
  return ["memory", "graph"] as const;
}

/** The wiki-link graph (`GET /api/memory/graph`). Pass `{ enabled: false }` to keep it inert. */
export function useMemoryGraphQuery(options?: { enabled?: boolean }) {
  return apiClient.memory.getGraph.useQuery({
    queryKey: getMemoryGraphQueryKey(),
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
