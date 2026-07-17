"use client";

import { useState } from "react";
import { SUBSYSTEMS, type SubsystemId } from "@zibby/contracts";
import { ButtonGroup, Container, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { ApprovalCard } from "../../agents/components/ApprovalCard/ApprovalCard";
import { useApproveMutation, useRejectMutation } from "../../approvals/mutations";
import { useApprovalsQuery } from "../../approvals/queries";

export enum ApprovalsPanelTestId {
  Root = "approvals-panel",
  /** The deselectable per-subsystem filter (NS2 F3c); only rendered when at
   *  least one pending approval carries an `ownerSubsystem` tag. */
  SubsystemFilter = "approvals-panel-subsystem-filter",
}

/** How many approval cards the overview shows inline — the rest live on /runs. */
const MAX_SHOWN = 4;

/**
 * The pending-approvals queue on the Overview page (moved off the right rail, which
 * is now a pure activity log). Shows the few newest decisions inline as
 * {@link ApprovalCard}s; the full queue is the `/runs?filter=awaiting-approval`
 * link. The `/runs` tab keeps its own waiting-for-approval view unchanged.
 *
 * Phase 108: shows EVERY pending approval across every project at once — the
 * Phase-24 top-bar "active project" scope (and its "Bez projektu" branch) is
 * gone. Per-project drill-down, where needed, lives on `/runs?project=<id>`.
 *
 * NS2 F3c: a deselectable subsystem filter narrows the queue client-side by the
 * approval's `ownerSubsystem` tag. Only subsystems with ≥1 pending approval get
 * a button; deselecting (or untagged-only queues) shows everything.
 */
export function ApprovalsPanel() {
  const t = useTranslations();
  const { data: approvals = [] } = useApprovalsQuery();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const [subsystemFilter, setSubsystemFilter] = useState<SubsystemId | null>(null);

  // Only subsystems that actually have a pending approval become filter options,
  // in registry order; counts ride along as the option's trailing figure.
  const pendingBySubsystem = new Map<SubsystemId, number>();
  for (const a of approvals) {
    if (a.ownerSubsystem) {
      pendingBySubsystem.set(a.ownerSubsystem, (pendingBySubsystem.get(a.ownerSubsystem) ?? 0) + 1);
    }
  }
  const filterOptions = SUBSYSTEMS.filter((s) => (pendingBySubsystem.get(s.id) ?? 0) > 0);
  const shown = subsystemFilter
    ? approvals.filter((a) => a.ownerSubsystem === subsystemFilter)
    : approvals;

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
      <Stack data-testid={ApprovalsPanelTestId.Root} gap="150">
        {filterOptions.length > 0 && (
          <Container data-testid={ApprovalsPanelTestId.SubsystemFilter}>
            <ButtonGroup
              deselectable
              ariaLabel={t("overview.approvalsSubsystemFilter")}
              onChange={(v) => setSubsystemFilter(v ? (v as SubsystemId) : null)}
              options={filterOptions.map((s) => ({
                id: s.id,
                label: s.name,
                trailing: pendingBySubsystem.get(s.id) ?? 0,
              }))}
              value={subsystemFilter ?? ""}
            />
          </Container>
        )}

        {shown.length === 0 ? (
          <Stack align="center" direction="row" gap="100">
            <StatusDot tone="ok" />
            <Typography mono size="sm" type="note" variant="secondary">
              {t("overview.noApprovals")}
            </Typography>
          </Stack>
        ) : (
          <Stack gap="150">
            {shown.slice(0, MAX_SHOWN).map((a) => (
              <ApprovalCard
                approval={a}
                key={a.id}
                onApprove={() => approve.mutate({ params: { id: a.id }, body: {} })}
                onReject={() => reject.mutate({ params: { id: a.id }, body: {} })}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </HudPanel>
  );
}
