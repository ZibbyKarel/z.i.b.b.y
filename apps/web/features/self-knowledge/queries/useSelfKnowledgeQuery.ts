import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the self-knowledge snapshot. */
export function getSelfKnowledgeQueryKey() {
  return ["self-knowledge"] as const;
}

/**
 * Loads the machine-generated self-knowledge snapshot (Fáze 1 — agents,
 * pipelines, gate rules, channels) for the read-only settings panel. Returns the
 * TanStack query result directly; `select` unwraps the ts-rest envelope so
 * `data` is the `SelfKnowledge` body.
 */
export function useSelfKnowledgeQuery() {
  return apiClient.selfKnowledge.getSelfKnowledge.useQuery({
    queryKey: getSelfKnowledgeQueryKey(),
    select: selectApiResponseBody,
  });
}
