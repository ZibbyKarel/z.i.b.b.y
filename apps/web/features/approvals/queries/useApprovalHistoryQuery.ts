import type { Approval as ContractApproval } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import { type DashboardApproval, parseApprovalDetail } from "../approval";

/** Shared cache key for decided approvals (Policy history table). */
export function getApprovalHistoryQueryKey() {
  return ["approvals", "history"] as const;
}

/**
 * Decided approvals (approved + rejected), newest decision first — the Policy
 * `/policy/approvals` history table. `listPendingApprovals` (despite its name)
 * lists every status when none is given, so this reuses it rather than adding
 * an endpoint, and filters/sorts client-side.
 */
function selectHistory(response: { body: ContractApproval[] }): DashboardApproval[] {
  return response.body
    .filter((a) => a.status !== "pending")
    .map(parseApprovalDetail)
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
}

export function useApprovalHistoryQuery() {
  return apiClient.approvals.listPendingApprovals.useQuery({
    queryKey: getApprovalHistoryQueryKey(),
    queryData: { query: {} },
    select: selectHistory,
  });
}
