import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for one agent's gates; exported so the mutation can invalidate it. */
export function getAgentGatesQueryKey(id: string) {
  return ["gates", "agent", id] as const;
}

/** An agent's inherited (locked) floor + its own rules (`GET /api/agents/:id/gates`). */
export function useAgentGatesQuery(id: string | null) {
  return apiClient.gates.getAgentGates.useQuery({
    queryKey: getAgentGatesQueryKey(id ?? ""),
    queryData: { params: { id: id ?? "" } },
    enabled: Boolean(id),
    select: selectApiResponseBody,
  });
}
