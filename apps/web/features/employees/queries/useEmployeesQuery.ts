import type { EmployeeQuery } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getEmployeesQueryKey } from "./keys";

/**
 * D-015 — the employee registry, optionally filtered by department/agentId/status.
 * Used by the `/org/people` directory (unfiltered, grouped client-side) and by a
 * department's Team tab (`department: id`).
 */
export function useEmployeesQuery(query?: EmployeeQuery) {
  return apiClient.employees.listEmployees.useQuery({
    queryKey: getEmployeesQueryKey(query),
    queryData: { query: query ?? {} },
    select: selectApiResponseBody,
  });
}
