import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getDepartmentsQueryKey } from "../queries/useDepartmentsQuery";

/**
 * Acknowledge a department's Tier-2 reports (`POST /api/departments/:id/seen`) —
 * resets its `report` window. Failed runs are read through the notification bell
 * instead; Tier-3 (`waiting`) items resolve only through approvals.
 */
export const useMarkDepartmentSeenMutation = makeInvalidatingMutation(
  apiClient.departments.markDepartmentSeen.useMutation,
  getDepartmentsQueryKey,
);
