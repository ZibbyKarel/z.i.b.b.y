"use client";

import { AnchoredSheet, Markdown, SheetBlock, normalizeStateTone } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useApprovalsQuery } from "../../../approvals";
import { useApprovalSheetParam } from "../../../approvals/useApprovalSheetParam";
import { useTaskRunQuery } from "../../../runs/queries/useTaskRunQuery";
import { RunDetail } from "../../../runs/components/RunDetail";
import { approvalForRun, runStateTone } from "../../../runs/run";
import { useCheckpointArtifact } from "../../../runs/useCheckpointArtifact";
import { type SheetProps, geometry } from "./sheetTypes";

/**
 * Run detail from `GET /api/tasks/runs/:id`: the very same `RunDetail` the run page renders
 * (approval banner, phases, metrics, LIVE / INPUT / OUTPUT, composer) — one source, so the two
 * never drift — with the gated phase's output (a stage checkpoint) slotted inside the approval card. The
 * run / task pages are one footer click away.
 */
export function RunSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const router = useRouter();
  const approvalSheet = useApprovalSheetParam();
  const { data: run } = useTaskRunQuery(id);
  const { data: approvals = [] } = useApprovalsQuery();
  const approval = run ? approvalForRun(approvals, run) : undefined;
  const checkpoint = useCheckpointArtifact(approval, run);

  if (!run) return null;

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      closeLabel={t("bridge.sheet.close")}
      kind={
        run.kind === "workflow"
          ? t("runs.detail.workflow", { name: run.owner })
          : `${t("bridge.sheet.kind.run")} · ${run.kind}`
      }
      onClose={onClose}
      onTitleClick={() => router.push(`/activity/runs/${run.runId}` as Route)}
      title={run.title || run.taskTitle || run.runId}
      tone={normalizeStateTone(runStateTone(run.status) ?? "idle")}
    >
      <RunDetail embedded onOpenApproval={approvalSheet.open} run={run}>
        {checkpoint ? (
          <SheetBlock label={t("bridge.sheet.run.output")}>
            <Markdown escapeHtml source={checkpoint} />
          </SheetBlock>
        ) : null}
      </RunDetail>
    </AnchoredSheet>
  );
}
