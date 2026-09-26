import type { Approval as ContractApproval } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import { type DashboardApproval, parseApprovalDetail } from "../approval";

/** Shared cache key for a single approval by id (the `?approval=` sheet). */
export function getApprovalQueryKey(id: string) {
  return ["approvals", "detail", id] as const;
}

function selectApproval(response: { body: ContractApproval }): DashboardApproval {
  return parseApprovalDetail(response.body);
}

/** One approval by id (`GET /api/approvals/:id`) — the ZB-08 `?approval=` sheet. */
export function useApprovalQuery(id: string | null) {
  return apiClient.approvals.getApproval.useQuery({
    queryKey: getApprovalQueryKey(id ?? ""),
    queryData: { params: { id: id ?? "" } },
    enabled: Boolean(id),
    select: selectApproval,
  });
}
