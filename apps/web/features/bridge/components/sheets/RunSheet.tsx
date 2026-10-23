"use client";

import {
  AnchoredSheet,
  Markdown,
  SheetAction,
  SheetBlock,
  SheetSection,
  normalizeStateTone,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { compactAgo } from "../../../../utils/time";
import { useApprovalsQuery } from "../../../approvals";
import { useTaskRunQuery } from "../../../runs/queries/useTaskRunQuery";
import { RunDetail } from "../../../runs/components/RunDetail";
import { approvalForRun, runStateTone, runTitle } from "../../../runs/run";
import { useCheckpointArtifact } from "../../../runs/useCheckpointArtifact";
import { type SheetProps, geometry } from "./sheetTypes";

/**
 * Run detail from `GET /api/tasks/runs/:id`: the very same `RunDetail` the run page renders
 * (approval banner, phases, metrics, LIVE / INPUT / OUTPUT, composer) — one source, so the two
 * never drift — with the gated phase's output (a stage checkpoint) slotted under the banner. The
 * full approval sheet (request changes) and the run / task pages are one footer click away.
 */
export function RunSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { data: run } = useTaskRunQuery(id);
  const { data: approvals = [] } = useApprovalsQuery();
  const approval = run ? approvalForRun(approvals, run) : undefined;
  const checkpoint = useCheckpointArtifact(approval, run);
  const [now] = useState(() => Date.now());

  if (!run) return null;

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      chips={[
        run.processor?.name ?? run.owner,
        run.projectId ?? run.project,
        ...(run.currentStage ? [run.currentStage] : []),
        t("bridge.sheet.created", { when: compactAgo(run.startedAt, now) }),
      ]}
      closeLabel={t("bridge.sheet.close")}
      footerEnd={
        approval ? (
          <SheetAction
            intent="primary"
            onClick={() => router.push(`${pathname}?approval=${approval.id}` as Route)}
          >
            {t("bridge.sheet.run.openApproval")}
          </SheetAction>
        ) : null
      }
      footerStart={
        <>
          <SheetAction onClick={() => router.push(`/activity/runs/${run.runId}` as Route)}>
            {t("bridge.sheet.run.open")}
          </SheetAction>
          {run.taskId ? (
            <SheetAction onClick={() => router.push(`/work/tasks/${run.taskId}` as Route)}>
              {t("bridge.sheet.task.open")}
            </SheetAction>
          ) : null}
        </>
      }
      hint={t("bridge.sheet.hint")}
      kind={`${t("bridge.sheet.kind.run")} · ${run.kind}`}
      onClose={onClose}
      stateLabel={t(`runs.state.${run.status}`)}
      title={runTitle(run)}
      tone={normalizeStateTone(runStateTone(run.status) ?? "idle")}
    >
      <RunDetail embedded run={run}>
        {checkpoint ? (
          <SheetSection>
            <SheetBlock label={t("bridge.sheet.run.output")}>
              <Markdown escapeHtml source={checkpoint} />
            </SheetBlock>
          </SheetSection>
        ) : null}
      </RunDetail>
    </AnchoredSheet>
  );
}
