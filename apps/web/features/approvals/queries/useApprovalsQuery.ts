import type { Approval as ContractApproval } from "@zibby/contracts";
import { useRunEventsConnected } from "../../runs/runEvents";
import { apiClient } from "../../../state/api";
import { type DashboardApproval, parseApprovalDetail } from "../approval";
import { getApprovalsQueryKey } from "./keys";

// Re-exported so existing deep importers keep resolving the key from here; the
// canonical home is the dependency-free `./keys` module (see its header).
export { getApprovalsQueryKey };

/**
 * Unpack each contract approval's enriched `detail` into a {@link DashboardApproval}
 * (semantic risk type + severity + structured preview). Plain-string details
 * degrade to `{ text }`, so this is safe against an unenriched backend.
 */
function selectApprovals(response: { body: ContractApproval[] }): DashboardApproval[] {
  return response.body.map(parseApprovalDetail);
}

/** Fallback cadence when the SSE channel is down — push covers the live path. */
const APPROVALS_POLL_MS = 60 * 1000;

/**
 * The pending approval queue (`GET /api/approvals?status=pending`). Freshness is
 * push-driven: the unified `/api/events` SSE channel invalidates this key on
 * `awaiting-approval` / parked transitions, channel-item events and `approval-*`
 * activity (see `RunEventsProvider`), so a new gate surfaces instantly. The 60s
 * interval exists ONLY while that stream is down (DNA: SSE for live streams,
 * polling for state) — while connected there is no timer at all.
 */
export function useApprovalsQuery() {
  const streamConnected = useRunEventsConnected();
  return apiClient.approvals.listPendingApprovals.useQuery({
    queryKey: getApprovalsQueryKey(),
    queryData: { query: { status: "pending" } },
    refetchInterval: streamConnected ? false : APPROVALS_POLL_MS,
    select: selectApprovals,
  });
}
