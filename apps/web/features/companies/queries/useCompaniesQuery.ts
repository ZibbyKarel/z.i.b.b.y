import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Shared cache key for the company registry — the TanStack cache is the FE source
 * of truth. Exported so mutations can target it for invalidation.
 */
export function getCompaniesQueryKey() {
  return ["companies"] as const;
}

/**
 * Live company registry from `GET /api/companies` — the contract `Company` entity
 * is the single shape used end to end. Returns the TanStack query result directly;
 * `select` unwraps the response envelope so `data` is `Company[]`.
 */
export function useCompaniesQuery() {
  return apiClient.companies.listCompanies.useQuery({
    queryKey: getCompaniesQueryKey(),
    select: selectApiResponseBody,
  });
}
