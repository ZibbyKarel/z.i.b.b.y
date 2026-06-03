import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

const HEALTH_POLL_MS = 10_000;

/** Shared cache key for the API liveness probe. */
export function getHealthQueryKey() {
  return ["health"] as const;
}

/**
 * Polls the API liveness probe so the dashboard always shows current status.
 * SSE would be overkill here — the payload changes slowly and one-directionally,
 * so a plain `refetchInterval` over TanStack Query is simpler and sufficient.
 *
 * Uses the contract-derived `tsr` hook: path, method and the `Health` response
 * type all come from `healthContract`, and the body is validated at runtime.
 * `online` is derived from the last successful fetch — a failed poll (API down,
 * network, CORS, or a non-2xx) lands in `error`, so `isSuccess` flips to `false`
 * while the query keeps retrying. Returns the TanStack query result directly;
 * `select` unwraps the envelope so `data` is the `Health` body.
 */
export function useHealthQuery() {
  return apiClient.health.getHealth.useQuery({
    queryKey: getHealthQueryKey(),
    refetchInterval: HEALTH_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
