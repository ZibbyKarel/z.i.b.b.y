import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the hook list. Exported so mutations can invalidate it. */
export function getHooksQueryKey() {
  return ["hooks"] as const;
}

/**
 * Live hook catalog from `GET /api/hooks` — the contract `Hook` entity is the
 * single shape used end to end. Returns the TanStack query result directly;
 * `select` unwraps the response envelope so `data` is `Hook[]`.
 */
export function useHooksQuery() {
  return apiClient.hooks.listHooks.useQuery({
    queryKey: getHooksQueryKey(),
    select: selectApiResponseBody,
  });
}
