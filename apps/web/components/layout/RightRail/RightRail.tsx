"use client";

import { Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ApprovalCard } from "../../../features/agents/components/ApprovalCard/ApprovalCard";
import { RunningAgentsPanel } from "../../../features/agents/components/RunningAgentsPanel";
import { useApproveMutation, useRejectMutation } from "../../../features/approvals/mutations";
import { useApprovalsQuery } from "../../../features/approvals/queries";
import { ParkedRunsPanel } from "../../../features/runs/components/ParkedRunsPanel";
import { HudPanel } from "../../HudPanel/HudPanel";

/**
 * The right rail — the approvals queue and the running-agents panel (the
 * limits moved to their single home, the top-bar rings). Self-contained: it
 * reads its own data, so the shell can drop it in as a slot without threading
 * props through.
 */
export function RightRail() {
  const t = useTranslations();
  const { data: approvals = [] } = useApprovalsQuery();
  const approve = useApproveMutation();
  const reject = useRejectMutation();

  return (
    <Stack gap="250">
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
            {approvals.map((a) => (
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

      <ParkedRunsPanel />

      <RunningAgentsPanel />
    </Stack>
  );
}
