import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getDivisionsQueryKey() {
  return ["departments", "divisions"] as const;
}

/** `GET /api/departments/divisions` — the org-chart divisions, in order. */
export function useDivisionsQuery() {
  return apiClient.departments.listDivisions.useQuery({
    queryKey: getDivisionsQueryKey(),
    select: selectApiResponseBody,
  });
}
