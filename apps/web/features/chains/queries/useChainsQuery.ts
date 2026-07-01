import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getChainsQueryKey } from "./keys";

// Re-exported so callers resolve the key from the hook module; the canonical
// home is the dependency-free `./keys` module (see its header).
export { getChainsQueryKey };

/** Chain definitions from `GET /api/chains` (operator-authored compositions). */
export function useChainsQuery() {
  return apiClient.chains.listChains.useQuery({
    queryKey: getChainsQueryKey(),
    select: selectApiResponseBody,
  });
}
