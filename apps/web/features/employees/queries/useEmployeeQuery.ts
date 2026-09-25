import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getEmployeeQueryKey } from "./keys";

/** One employee (`/org/people/[id]` profile), with its derived state. */
export function useEmployeeQuery(id: string) {
  return apiClient.employees.getEmployee.useQuery({
    queryKey: getEmployeeQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
