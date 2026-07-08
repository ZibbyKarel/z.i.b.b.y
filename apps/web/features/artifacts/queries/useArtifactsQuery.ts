import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the durable artifact registry list. */
export function getArtifactsQueryKey() {
  return ["artifacts"] as const;
}

/**
 * The durable artifact registry (N2a, `GET /api/artifacts`) — a read-only,
 * newest-first provenance log written by pipeline delivery sinks at delivery
 * time. Unfiltered here: the registry is a plain-JSON list with no live
 * volume concern yet, and its own filters (`projectId`/`pipelineId`) only take
 * ONE id each — a subsystem's "owned" set (Phase 88's `ArtefaktyTab`) can be
 * several pipelines, so the caller filters client-side the same way
 * `AktivitaTab` (Phase 86) scopes the unified runs feed. Returns the TanStack
 * query result directly; `select` only strips the ts-rest envelope, so `data`
 * is the contract `ArtifactRecord[]` body.
 */
export function useArtifactsQuery() {
  return apiClient.artifacts.listArtifacts.useQuery({
    queryKey: getArtifactsQueryKey(),
    queryData: { query: {} },
    select: selectApiResponseBody,
  });
}
