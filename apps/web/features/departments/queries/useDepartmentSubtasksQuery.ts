import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a department's subtasks read model (ZB-04a §5). */
export function getDepartmentSubtasksQueryKey(id: string) {
  return ["departments", id, "subtasks"] as const;
}

/**
 * `GET /api/departments/:id/subtasks` — every subtask stamped `department === id`.
 * Used by the department Subtasks tab and the ORG map focus panel; disabled while
 * `id` is undefined so the map doesn't fan out a request per department.
 */
export function useDepartmentSubtasksQuery(id: string | undefined) {
  return apiClient.departments.getDepartmentSubtasks.useQuery({
    queryKey: getDepartmentSubtasksQueryKey(id ?? ""),
    queryData: { params: { id: id ?? "" } },
    enabled: id !== undefined,
    select: selectApiResponseBody,
  });
}
