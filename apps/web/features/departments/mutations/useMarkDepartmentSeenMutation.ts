import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getDepartmentsQueryKey } from "../queries/useDepartmentsQuery";

/**
 * Acknowledge a department's Tier-2 reports and failed runs (`POST
 * /api/departments/:id/seen`) — the ORG map's focus panel calls this from its
 * failed-runs "dismiss", which clears the department's (and Zibby's) `error`.
 * Tier-3 (`waiting`) items are untouched (they resolve only through approvals).
 */
export const useMarkDepartmentSeenMutation = makeInvalidatingMutation(
  apiClient.departments.markDepartmentSeen.useMutation,
  getDepartmentsQueryKey,
);
