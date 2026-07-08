import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

const SELF_STATUS_POLL_MS = 2 * 60 * 1000; // 2m

/** Shared cache key for the ZIBBY install repo's own freshness readout. */
export function getSelfStatusQueryKey() {
  return ["self-status"] as const;
}

/**
 * Phase 79 — polls `GET /api/self/status`: the ZIBBY install repo's freshness
 * vs. `origin` (behind/ahead/dirty) plus its open PRs. Same posture as
 * `useHealthQuery`/`useLimitsQuery` — a slowly-changing, one-directional
 * payload, so a plain `refetchInterval` beats SSE. Returns the TanStack query
 * result directly; `select` unwraps the ts-rest envelope so `data` is the
 * `SelfStatus` body. Before the first success `data` is `undefined` — the
 * top-bar control falls back to a calm "up to date" readout so it never
 * flashes a warning on load.
 */
export function useSelfStatusQuery() {
  return apiClient.self.getSelfStatus.useQuery({
    queryKey: getSelfStatusQueryKey(),
    refetchInterval: SELF_STATUS_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
