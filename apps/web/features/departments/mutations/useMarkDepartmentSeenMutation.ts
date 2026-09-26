import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getDepartmentsQueryKey } from "../queries/useDepartmentsQuery";

/**
 * Acknowledge a department's Tier-2 reports (`POST /api/departments/:id/seen`) — the
 * web calls this when the operator opens the department's drawer (phase 84).
 * Resets its `report` window; Tier-3 (`waiting`) items are untouched (they resolve
 * only through the approvals flow).
 */
export const useMarkDepartmentSeenMutation = makeInvalidatingMutation(
  apiClient.departments.markDepartmentSeen.useMutation,
  getDepartmentsQueryKey,
);
