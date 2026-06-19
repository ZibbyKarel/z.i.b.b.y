import type { Approval as ContractApproval } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import { type DashboardApproval, parseApprovalDetail } from "../approval";

/** Shared cache key for pending approvals; exported so mutations can invalidate it. */
export function getApprovalsQueryKey() {
  return ["approvals", "pending"] as const;
}

/**
 * Unpack each contract approval's enriched `detail` into a {@link DashboardApproval}
 * (semantic risk type + severity + structured preview). Plain-string details
 * degrade to `{ text }`, so this is safe against an unenriched backend.
 */
function selectApprovals(response: { body: ContractApproval[] }): DashboardApproval[] {
  return response.body.map(parseApprovalDetail);
}

/**
 * Poll the pending approval queue (`GET /api/approvals?status=pending`). The 60s
 * interval is only a fallback: the runs feed invalidates this key the instant a run
 * enters `awaiting-approval` (see `useRunsQuery`), so a new gate surfaces in ~2s.
 */
export function useApprovalsQuery() {
  return apiClient.approvals.listPendingApprovals.useQuery({
    queryKey: getApprovalsQueryKey(),
    queryData: { query: { status: "pending" } },
    refetchInterval: 1 * 60 * 1000, //1m
    select: selectApprovals,
  });
}
