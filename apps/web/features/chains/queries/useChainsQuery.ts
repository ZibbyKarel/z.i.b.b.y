import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the chain library (`GET /api/handoff/chains`). */
export function getChainsQueryKey() {
  return ["chains"] as const;
}

/**
 * ZB-05b — the full chain library: every `handoff/chains` signal kind resolved
 * to its route (`ChainSchema[]`). Feeds `/work/chains`'s `DataTable` and the
 * New Task / project-default chain pickers.
 */
export function useChainsQuery() {
  return apiClient.handoff.listChains.useQuery({
    queryKey: getChainsQueryKey(),
    select: selectApiResponseBody,
  });
}
