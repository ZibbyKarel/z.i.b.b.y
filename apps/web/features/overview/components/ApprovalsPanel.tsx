"use client";

import type { Approval } from "@zibby/contracts";
import { Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { ApprovalCard } from "../../agents/components/ApprovalCard/ApprovalCard";
import { useApproveMutation, useRejectMutation } from "../../approvals/mutations";
import { useApprovalsQuery } from "../../approvals/queries";
import { ProjectScopeChip, useActiveProject } from "../../projects";
import { useRunsQuery } from "../../runs/queries/useRunsQuery";
import type { RunView } from "../../runs/run";

/** How many approval cards the overview shows inline — the rest live on /runs. */
const MAX_SHOWN = 4;

/**
 * The project an approval is attributed to (Fáze 11), resolved through its linked
 * run in the unified feed — an approval carries no `projectId` of its own, but the
 * run/task it gates does. The runId matching mirrors `approvalForRun` (features/runs):
 * agent runs match exactly, a pipeline-stage approval's runId is prefixed by the
 * pipeline run id, a held/output task names the approval (`approvalId`) or is keyed
 * by its task id. Approvals with no resolvable run (channel/jira/machine/proposals)
 * stay unattributed and show only under "Bez projektu".
 */
function approvalProjectId(a: Approval, runs: readonly RunView[]): string | undefined {
  const run = runs.find(
    (r) =>
      r.runId === a.runId ||
      a.runId.startsWith(`${r.runId}.`) ||
      r.taskId === a.runId ||
      r.approvalId === a.id,
  );
  return run?.projectId;
}

/**
 * The pending-approvals queue on the Overview page (moved off the right rail, which
 * is now a pure activity log). Shows the few newest decisions inline as
 * {@link ApprovalCard}s; the full queue is the `/runs?filter=awaiting-approval`
 * link. The `/runs` tab keeps its own waiting-for-approval view unchanged.
 *
 * Phase 24: the top-bar project is the single scope — a real project keeps only
 * approvals whose linked run is attributed to it; "Bez projektu" keeps only
 * unattributed approvals. There is no "show everything" branch.
 */
export function ApprovalsPanel() {
  const t = useTranslations();
  const { data: allApprovals = [] } = useApprovalsQuery();
  const { runs } = useRunsQuery();
  const { activeProjectId } = useActiveProject();
  const approve = useApproveMutation();
  const reject = useRejectMutation();

  const approvals =
    activeProjectId === null
      ? allApprovals.filter((a) => !approvalProjectId(a, runs))
      : allApprovals.filter((a) => approvalProjectId(a, runs) === activeProjectId);

  return (
    <HudPanel
      action={
        <Stack align="center" direction="row" gap="100">
          {/* Fáze 11: subtle indication that the queue is project-scoped. */}
          <ProjectScopeChip />
          <Link href="/runs?filter=awaiting-approval">
            <Typography mono size="xs" tone="accent" type="note">
              {t("overview.allApprovals")}
            </Typography>
          </Link>
        </Stack>
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
