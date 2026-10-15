import type { Integration } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Cache key for one company's own integrations. Nested under the `["integrations"]`
 * prefix, so every integration mutation's bare invalidation refreshes it too.
 */
export function getCompanyIntegrationsQueryKey(companyId: string) {
  return ["integrations", { companyId }] as const;
}

/**
 * The integrations OWNED by a company (`companyId` set). The list endpoint has no
 * company filter, so this fetches the catalog and narrows it in `select`.
 */
export function useCompanyIntegrationsQuery(companyId: string) {
  return apiClient.integrations.listIntegrations.useQuery({
    queryKey: getCompanyIntegrationsQueryKey(companyId),
    queryData: { query: {} },
    select: (res): Integration[] =>
      selectApiResponseBody(res).filter((i) => i.companyId === companyId),
  });
}
