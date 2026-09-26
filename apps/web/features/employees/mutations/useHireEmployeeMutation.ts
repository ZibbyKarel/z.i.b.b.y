import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { employeesRootKey } from "../queries/keys";
import { getDepartmentRosterQueryKey } from "../../departments/queries";

/** Hire an employee (D-015): `POST /api/departments/:id/employees`. */
export function useHireEmployeeMutation(departmentId: string) {
  const qc = useQueryClient();
  return apiClient.employees.hireEmployee.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: employeesRootKey });
      void qc.invalidateQueries({ queryKey: getDepartmentRosterQueryKey(departmentId) });
    },
  });
}
