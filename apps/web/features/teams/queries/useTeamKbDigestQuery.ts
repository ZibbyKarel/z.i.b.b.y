import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getTeamKbDigestQueryKey(teamId: string) {
  return ["teams", teamId, "kb", "digest"] as const;
}

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "status" in error && error.status === 404;

/**
 * Open questions + agreements of a team's KB (`GET /api/teams/:id/kb/digest`). No polling: the
 * KB changes only through sync or ingest. Pass `teamId: undefined` to keep the hook inert. A 404
 * (no team / no KB) is a state, not a failure — it is not retried; read it via `isNoKb`.
 */
export function useTeamKbDigestQuery(teamId: string | undefined) {
  const query = apiClient.teams.getTeamKbDigest.useQuery({
    queryKey: getTeamKbDigestQueryKey(teamId ?? ""),
    queryData: { params: { id: teamId ?? "" } },
    select: selectApiResponseBody,
    enabled: teamId !== undefined,
    staleTime: 5 * 60_000,
    retry: (count, error) => !isNotFound(error) && count < 2,
  });
  return { ...query, isNoKb: isNotFound(query.error) };
}
