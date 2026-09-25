import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { employeesRootKey } from "../queries/keys";

/** Fire an employee (D-015, soft-delete): `DELETE /api/employees/:id`. */
export function useFireEmployeeMutation() {
  const qc = useQueryClient();
  return apiClient.employees.fireEmployee.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: employeesRootKey }),
  });
}
