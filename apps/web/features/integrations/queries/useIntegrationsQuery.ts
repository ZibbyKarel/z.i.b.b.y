import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Shared cache key for the integration list. Exported so mutations can invalidate
 * it. The `["integrations"]` prefix means a bare invalidation also clears every
 * project-scoped variant (`["integrations", { projectId }]`) by partial match.
 */
export function getIntegrationsQueryKey(projectId?: string) {
  return projectId ? (["integrations", { projectId }] as const) : (["integrations"] as const);
}

/**
 * Live integration catalog from `GET /api/integrations` — the contract
 * `Integration` entity is the single shape used end to end. Returns the TanStack
 * query result directly; `select` unwraps the response envelope so `data` is
 * `Integration[]`. Pass a `projectId` to fetch only that project's integrations
 * (integrations are owned by a project: one project = one company).
 */
export function useIntegrationsQuery(projectId?: string) {
  return apiClient.integrations.listIntegrations.useQuery({
    queryKey: getIntegrationsQueryKey(projectId),
    queryData: { query: projectId ? { projectId } : {} },
    select: selectApiResponseBody,
  });
}
