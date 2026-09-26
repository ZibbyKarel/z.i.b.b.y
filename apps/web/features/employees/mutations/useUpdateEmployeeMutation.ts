import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { employeesRootKey } from "../queries/keys";

/** Rename and/or move an employee: `PATCH /api/employees/:id`. */
export function useUpdateEmployeeMutation() {
  const qc = useQueryClient();
  return apiClient.employees.updateEmployee.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: employeesRootKey }),
  });
}
