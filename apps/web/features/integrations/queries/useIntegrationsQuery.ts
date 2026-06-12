import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the integration list. Exported so mutations can invalidate it. */
export function getIntegrationsQueryKey() {
  return ["integrations"] as const;
}

/**
 * Live integration catalog from `GET /api/integrations` — the contract
 * `Integration` entity is the single shape used end to end. Returns the TanStack
 * query result directly; `select` unwraps the response envelope so `data` is
 * `Integration[]`.
 */
export function useIntegrationsQuery() {
  return apiClient.integrations.listIntegrations.useQuery({
    queryKey: getIntegrationsQueryKey(),
    select: selectApiResponseBody,
  });
}
