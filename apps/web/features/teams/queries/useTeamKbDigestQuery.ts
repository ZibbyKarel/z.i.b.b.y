import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Prefix of every cache entry under a team's KB (digest, notes, graph, ingest). */
export function getTeamKbQueryKeyPrefix(teamId: string) {
  return ["teams", teamId, "kb"] as const;
}

export function getTeamKbDigestQueryKey(teamId: string) {
  return [...getTeamKbQueryKeyPrefix(teamId), "digest"] as const;
}

/** True for the 404 (no team / no KB) — a state to render, not a failure. */
export const isNoKbError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "status" in error && error.status === 404;

/**
 * Open questions + agreements of a team's KB (`GET /api/teams/:id/kb/digest`). No polling: the
 * KB changes only through sync or ingest. Pass `teamId: undefined` to keep the hook inert. A 404
 * (no team / no KB) is not retried; classify `error` with `isNoKbError`.
 */
export function useTeamKbDigestQuery(teamId: string | undefined) {
  return apiClient.teams.getTeamKbDigest.useQuery({
    queryKey: getTeamKbDigestQueryKey(teamId ?? ""),
    queryData: { params: { id: teamId ?? "" } },
    select: selectApiResponseBody,
    enabled: teamId !== undefined,
    staleTime: 5 * 60_000,
    retry: (count, error) => !isNoKbError(error) && count < 2,
  });
}
