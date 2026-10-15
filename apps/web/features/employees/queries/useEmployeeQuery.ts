import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { getEmployeeQueryKey } from "./keys";

/** One employee (`/workforce/agents/[id]` profile), with its derived state. */
export function useEmployeeQuery(id: string) {
  return apiClient.employees.getEmployee.useQuery({
    queryKey: getEmployeeQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
    // State derives from live run status (e.g. blocked → working after an approval).
    refetchInterval: 3000,
  });
}
