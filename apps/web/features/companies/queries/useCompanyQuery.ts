import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getCompanyQueryKey(id: string) {
  return ["companies", id] as const;
}

/** Single company by id (`GET /api/companies/:id`). Pass `{ enabled: false }` to keep
 * the hook inert (e.g. the "new company" detail screen, which has no id yet). */
export function useCompanyQuery(id: string, options?: { enabled?: boolean }) {
  return apiClient.companies.getCompany.useQuery({
    queryKey: getCompanyQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
