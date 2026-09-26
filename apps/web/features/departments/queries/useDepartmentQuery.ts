import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a single department (`GET /api/departments/:id`). */
export function getDepartmentQueryKey(id: string) {
  return ["departments", id] as const;
}

/** One department by id, with its live status — the department detail header. */
export function useDepartmentQuery(id: string) {
  return apiClient.departments.getDepartment.useQuery({
    queryKey: getDepartmentQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
