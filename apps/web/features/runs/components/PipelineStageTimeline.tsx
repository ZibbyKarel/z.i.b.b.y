"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, CodeBlock, Stack, Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useStageRunLogQuery } from "../queries/useStageRunLogQuery";
import type { RunView } from "../run";
import { RunStateBadge } from "./RunStateBadge";

export interface PipelineStageTimelineProps {
  run: RunView;
}

/**
 * One pipeline stage's log — read on demand from the per-phase endpoint
 * (`GET /api/pipelines/runs/:id/stages/:phaseId/logs`), the same source the parked
 * panel uses for the failing-phase tail. Mounted only while the row is expanded, so
 * a collapsed stage costs nothing.
 */
function StageLog({ pipelineRunId, phaseId }: { pipelineRunId: string; phaseId: string }) {
  const t = useTranslations("runs");
  const { data, isPending } = useStageRunLogQuery(pipelineRunId, phaseId);
  const text = (data?.content ?? "").replace(/\n$/, "");
  if (isPending) {
    return (
      <Typography mono size="2xs" type="note" variant="tertiary">
        {t("liveLog")}…
      </Typography>
    );
  }
  return text ? (
    <CodeBlock maxHeight="viewport" text={text} />
  ) : (
    <Typography mono size="2xs" type="note" variant="tertiary">
      {t("stageNoLog")}
    </Typography>
  );
}

/**
 * Phase 28: a pipeline run's detail surface IS its stage timeline — one row per
 * `stageRun` (phase + attempt + status), each with a "log" disclosure that opens that
 * phase's log inline. Mirrors `GoalDetailPanel`'s iteration timeline so a pipeline run
 * is "always answerable" without leaving the task detail. A single open at a time keeps
 * at most one stage-log query in flight. The footer links to the pipeline *definition*
 * (a different surface — the template, not this run).
 */
export function PipelineStageTimeline({ run }: PipelineStageTimelineProps) {
  const t = useTranslations("runs");
  const router = useRouter();
  const stages = run.stageRuns ?? [];
  // Which stage's log is expanded (`"${phaseId}#${attempt}"`), or null. Single open ⇒
  // at most one stage-log fetch live.
  const [openLog, setOpenLog] = useState<string | null>(null);

  return (
    <HudPanel padding="250" title={t("stageTimeline")}>
      {stages.length === 0 ? (
        <Stack gap="100">
          <Typography mono size="xs" type="note" variant="tertiary">
            {t("stageNone")}
          </Typography>
          <Stack direction="row" justify="end">
            <Button
              icon="flow"
              intent="ghost"
              onClick={() => router.push(`/pipelines/${run.owner}`)}
              size="sm"
            >
              {t("openPipeline")}
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack gap="100">
          {stages.map((s) => {
            const key = `${s.phaseId}#${s.attempt}`;
            const isOpen = openLog === key;
            return (
              <Stack gap="50" key={key}>
                <Stack align="center" direction="row" gap="100" justify="between">
                  <Stack align="center" direction="row" gap="100">
                    <Typography mono size="xs" type="note" variant="secondary" weight="semibold">
                      {s.phaseId}
                    </Typography>
                    {s.attempt > 1 && (
                      <Typography mono size="2xs" type="note" variant="tertiary">
                        {t("stageAttempt", { n: s.attempt })}
                      </Typography>
                    )}
                  </Stack>
                  <Stack align="center" direction="row" gap="100">
                    <RunStateBadge
                      canonTitle={s.status}
                      label={t(`state.${s.status}`)}
                      status={s.status}
                    />
                    <Button
                      icon="code"
                      intent="ghost"
                      onClick={() => setOpenLog(isOpen ? null : key)}
                      size="sm"
                    >
                      {t("goalOpenLog")}
                    </Button>
                  </Stack>
                </Stack>
                {isOpen && <StageLog phaseId={s.phaseId} pipelineRunId={run.runId} />}
              </Stack>
            );
          })}
          <Stack direction="row" justify="end">
            <Button
              icon="flow"
              intent="ghost"
              onClick={() => router.push(`/pipelines/${run.owner}`)}
              size="sm"
            >
              {t("openPipeline")}
            </Button>
          </Stack>
        </Stack>
      )}
    </HudPanel>
  );
}
