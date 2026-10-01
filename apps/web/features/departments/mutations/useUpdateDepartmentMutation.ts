import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getDepartmentsQueryKey } from "../queries/useDepartmentsQuery";

/** Update a department's editable fields (`PATCH /api/departments/:id`). */
export const useUpdateDepartmentMutation = makeInvalidatingMutation(
  apiClient.departments.updateDepartment.useMutation,
  getDepartmentsQueryKey,
);
