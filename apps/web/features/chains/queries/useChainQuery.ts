import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a single chain's detail (`GET /api/handoff/chains/:id`). */
export function getChainQueryKey(id: string) {
  return ["chains", "detail", id] as const;
}

/** `/work/chains/[id]`'s data source — one chain by id. */
export function useChainQuery(id: string) {
  return apiClient.handoff.getChain.useQuery({
    queryKey: getChainQueryKey(id),
    queryData: { params: { id } },
    enabled: Boolean(id),
    select: selectApiResponseBody,
  });
}
