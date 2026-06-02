import { apiClient } from "../../state/api";

const HEALTH_POLL_MS = 10_000;

/**
 * Polls the API liveness probe so the dashboard always shows current status.
 * SSE would be overkill here — the payload changes slowly and one-directionally,
 * so a plain `refetchInterval` over TanStack Query is simpler and sufficient.
 *
 * Uses the contract-derived `tsr` hook: path, method and the `Health` response
 * type all come from `healthContract`, and the body is validated at runtime.
 * `online` is derived from the last successful fetch — a failed poll (API down,
 * network, CORS, or a non-2xx) lands in `error`, so `isSuccess` flips to `false`
 * while the query keeps retrying.
 */
export function useHealth() {
  return apiClient.health.getHealth.useQuery({
    queryKey: ["health"],
    refetchInterval: HEALTH_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
  });
}
