"use client";

import { Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { ApprovalCard } from "../../agents/components/ApprovalCard/ApprovalCard";
import { useApproveMutation, useRejectMutation } from "../../approvals/mutations";
import { useApprovalsQuery } from "../../approvals/queries";

/** How many approval cards the overview shows inline — the rest live on /runs. */
const MAX_SHOWN = 4;

/**
 * The pending-approvals queue on the Overview page (moved off the right rail, which
 * is now a pure activity log). Shows the few newest decisions inline as
 * {@link ApprovalCard}s; the full queue is the `/runs?filter=awaiting-approval`
 * link. The `/runs` tab keeps its own waiting-for-approval view unchanged.
 */
export function ApprovalsPanel() {
  const t = useTranslations();
  const { data: approvals = [] } = useApprovalsQuery();
  const approve = useApproveMutation();
  const reject = useRejectMutation();

  return (
    <HudPanel
      action={
        <Link href="/runs?filter=awaiting-approval">
          <Typography mono size="xs" tone="accent" type="note">
            {t("overview.allApprovals")}
          </Typography>
        </Link>
      }
      title={t("overview.approvalsQueue")}
    >
      {approvals.length === 0 ? (
        <Stack align="center" direction="row" gap="100">
          <StatusDot tone="ok" />
          <Typography mono size="sm" type="note" variant="secondary">
            {t("overview.noApprovals")}
          </Typography>
        </Stack>
      ) : (
        <Stack gap="150">
          {approvals.slice(0, MAX_SHOWN).map((a) => (
            <ApprovalCard
              approval={a}
              key={a.id}
              onApprove={() => approve.mutate({ params: { id: a.id }, body: {} })}
              onReject={() => reject.mutate({ params: { id: a.id }, body: {} })}
            />
          ))}
        </Stack>
      )}
    </HudPanel>
  );
}
