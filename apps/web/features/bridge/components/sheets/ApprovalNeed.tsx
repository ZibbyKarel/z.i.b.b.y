"use client";

import { NeedsYouCard } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useApproveMutation, useRejectMutation } from "../../../approvals";
import { type DashboardApproval, HIGH_RISK_TYPES, formatWaited } from "../../../approvals/approval";

/** Mono diff lines of an approval's structured diff preview (`@@` hunk header + `+/-/ ` lines). */
export function approvalDiffLines(a: DashboardApproval): string[] {
  if (a.preview?.kind !== "diff") return [];
  return a.preview.hunks.flatMap((h) => [
    h.h,
    ...h.lines.map(([k, text]) => `${k === "add" ? "+" : k === "del" ? "-" : " "}${text}`),
  ]);
}

/** Payment / deletion approvals need the hold-to-confirm guardrail, which lives on the task page. */
export const isHighRisk = (a: DashboardApproval) =>
  a.riskType !== undefined && HIGH_RISK_TYPES.has(a.riskType);

export interface ApprovalNeedProps {
  approval: DashboardApproval;
}

/**
 * The "needs you" card of a pending approval: APPROVE / DENY wired to the same mutations the
 * approvals queue uses. High-risk kinds (payment / deletion) get DENY only — approving them
 * requires the hold-to-confirm control on the task page, never a single click here.
 */
export function ApprovalNeed({ approval: a }: ApprovalNeedProps) {
  const t = useTranslations();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const pending = approve.isPending || reject.isPending;
  return (
    <NeedsYouCard
      approveLabel={t("bridge.sheet.approve")}
      denyLabel={t("bridge.sheet.deny")}
      diff={approvalDiffLines(a)}
      heading={t("bridge.sheet.needsYou", { kind: a.kind })}
      onApprove={
        isHighRisk(a) ? undefined : () => approve.mutate({ params: { id: a.id }, body: {} })
      }
      onDeny={() => reject.mutate({ params: { id: a.id }, body: {} })}
      pending={pending}
      rule={isHighRisk(a) ? t("bridge.sheet.holdRule") : undefined}
      text={a.summary ?? a.text ?? a.detail}
      wait={t("bridge.sheet.waiting", { wait: formatWaited(a.requestedAt) })}
    />
  );
}
