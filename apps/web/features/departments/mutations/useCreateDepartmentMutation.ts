import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getDepartmentsQueryKey } from "../queries/useDepartmentsQuery";

/** Create a department (`POST /api/departments`); refreshes the departments list. */
export const useCreateDepartmentMutation = makeInvalidatingMutation(
  apiClient.departments.createDepartment.useMutation,
  getDepartmentsQueryKey,
);
