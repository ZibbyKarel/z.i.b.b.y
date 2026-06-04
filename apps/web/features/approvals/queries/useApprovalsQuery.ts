import type { Approval as ContractApproval } from "@zibby/contracts";
import { apiClient } from "../../../state/api";
import type { Approval } from "../../../domain";

/** Shared cache key for pending approvals; exported so mutations can invalidate it. */
export function getApprovalsQueryKey() {
  return ["approvals", "pending"] as const;
}

/** Map the contract `Approval` to the dashboard's display `Approval`. */
function selectApprovals(response: { body: ContractApproval[] }): Approval[] {
  return response.body.map((a) => ({
    id: a.id,
    skill: a.skill,
    action: a.action,
    detail: a.detail,
    risk: a.risk,
  }));
}

/**
 * Poll the pending approval queue (`GET /api/approvals?status=pending`). The gate
 * is the identity core, so the queue refreshes briskly (2s) — polling, not SSE.
 */
export function useApprovalsQuery() {
  return apiClient.approvals.listPendingApprovals.useQuery({
    queryKey: getApprovalsQueryKey(),
    queryData: { query: { status: "pending" } },
    refetchInterval: 2000,
    select: selectApprovals,
  });
}
