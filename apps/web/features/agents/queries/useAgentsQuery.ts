import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Shared cache key for the agent list — the TanStack cache is the FE source of
 * truth. Exported so mutations can target it for invalidation.
 */
export function getAgentsQueryKey() {
  return ["agents"] as const;
}

/**
 * Live agent catalog from `GET /api/agents` — the contract `Agent` entity is the
 * single shape used end to end (no separate UI type). Returns the TanStack query
 * result directly; `select` unwraps the response envelope so `data` is `Agent[]`.
 * Backed by the shared `["agents"]` cache, so every screen that calls this (agents,
 * pipelines, overview) reads one source and re-renders together on a mutation.
 */
export function useAgentsQuery() {
  return apiClient.agents.listAgents.useQuery({
    queryKey: getAgentsQueryKey(),
    select: selectApiResponseBody,
  });
}
