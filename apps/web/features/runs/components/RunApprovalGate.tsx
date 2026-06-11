"use client";

import { useState } from "react";
import {
  type ApprovalDecision,
  ApprovalDetail,
} from "../../approvals/components/ApprovalDetail";
import { useApproveMutation, useRejectMutation } from "../../approvals/mutations";
import { useApprovalsQuery } from "../../approvals/queries";

export interface RunApprovalGateProps {
  runId: string;
}

/**
 * The approval gate inline in the run detail — for a run paused on
 * `awaiting-approval` it renders the full approval summary (what exactly the
 * agent is about to do) with the approve/reject footer. The decision resumes
 * or terminates the paused run; the runs feed then picks the new status up.
 */
export function RunApprovalGate({ runId }: RunApprovalGateProps) {
  const { data: queue = [] } = useApprovalsQuery();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const [decision, setDecision] = useState<ApprovalDecision>(null);

  const approval = queue.find((a) => a.runId === runId);
  if (!approval) return null;

  const decide = (kind: Exclude<ApprovalDecision, null>) => {
    setDecision(kind);
    const mutation = kind === "approved" ? approve : reject;
    mutation.mutate({ params: { id: approval.id }, body: {} });
  };

  return (
    <ApprovalDetail
      approval={approval}
      decision={decision}
      onApprove={() => decide("approved")}
      onReject={() => decide("rejected")}
      onReset={() => setDecision(null)}
      pending={approve.isPending || reject.isPending}
    />
  );
}
