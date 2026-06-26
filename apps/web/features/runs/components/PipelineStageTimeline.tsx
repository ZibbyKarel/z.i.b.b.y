"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Stack, Tag, Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useStageRunLogQuery } from "../queries/useStageRunLogQuery";
import type { RunView } from "../run";
import { RunStateBadge } from "./RunStateBadge";
import { RunTranscript } from "./RunTranscript";

export interface PipelineStageTimelineProps {
  /** The pipeline run whose stages to show (its own runId, or a goal's pipeline maker ref). */
  pipelineRunId: string;
  /** The pipeline definition id, for the "open pipeline" link (empty → link hidden). */
  owner: string;
  /** The per-phase stage runs (may be undefined while the run aggregate is loading). */
  stageRuns: RunView["stageRuns"];
  /** The phase currently executing — surfaced as a live row when the run is running. */
  currentStage?: string | null;
  /** Whether the run is still executing (drives the synthetic live stage row + live log). */
  live?: boolean;
}

/**
 * One pipeline stage's log — read on demand from the per-phase endpoint
 * (`GET /api/pipelines/runs/:id/stages/:phaseId/logs`), the same source the parked
 * panel uses for the failing-phase tail. Mounted only while the row is expanded, so
 * a collapsed stage costs nothing. A `live` (still-running) phase re-reads on an
 * interval and follows the tail, so the log grows in place instead of appearing only
 * once the phase finishes.
 */
function StageLog({
  pipelineRunId,
  phaseId,
  live,
}: {
  pipelineRunId: string;
  phaseId: string;
  live: boolean;
}) {
  const t = useTranslations("runs");
  const { data, isPending } = useStageRunLogQuery(pipelineRunId, phaseId, live);
  const text = (data?.content ?? "").replace(/\n$/, "");
  if (isPending) {
    return (
      <Typography mono size="2xs" type="note" variant="tertiary">
        {t("liveLog")}…
      </Typography>
    );
  }
  return text ? (
    <RunTranscript live={live} maxHeight="viewport" scrollKey={text} text={text} />
  ) : (
    <Typography mono size="2xs" type="note" variant="tertiary">
      {live ? `${t("liveLog")}…` : t("stageNoLog")}
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
export function PipelineStageTimeline({
  pipelineRunId,
  owner,
  stageRuns,
  currentStage,
  live = false,
}: PipelineStageTimelineProps) {
  const t = useTranslations("runs");
  const router = useRouter();
  const terminalStages = stageRuns ?? [];
  // The phase executing right now isn't in `stageRuns` yet (that append is
  // terminal-only), so synthesize a live row for it — its attempt is one past the
  // terminal attempts already recorded for that phase. Without this the running
  // phase (and its growing log) would be invisible until it finished.
  const liveRow: (typeof terminalStages)[number] | null =
    live && currentStage
      ? {
          phaseId: currentStage,
          runId: "",
          attempt: terminalStages.filter((s) => s.phaseId === currentStage).length + 1,
          status: "running" as const,
        }
      : null;
  const stages = liveRow ? [...terminalStages, liveRow] : terminalStages;
  // Which stage's log is expanded (`"${phaseId}#${attempt}"`), or null. Single open ⇒
  // at most one stage-log fetch live.
  const [openLog, setOpenLog] = useState<string | null>(null);
  // The live phase opens by default so its log streams without a click; an explicit
  // toggle takes over from there (collapsing it falls back to the live phase again).
  const liveKey = liveRow ? `${liveRow.phaseId}#${liveRow.attempt}` : null;
  const openKey = openLog ?? liveKey;

  // Link to the pipeline *definition* (a different surface than this run). Hidden when
  // the owner id isn't known yet (e.g. a goal's maker run aggregate still loading).
  const openPipelineLink = owner ? (
    <Stack direction="row" justify="end">
      <Button
        icon="flow"
        intent="ghost"
        onClick={() => router.push(`/pipelines/${owner}`)}
        size="sm"
      >
        {t("openPipeline")}
      </Button>
    </Stack>
  ) : null;

  return (
    <HudPanel padding="250" title={t("stageTimeline")}>
      {stages.length === 0 ? (
        <Stack gap="100">
          <Typography mono size="xs" type="note" variant="tertiary">
            {t("stageNone")}
          </Typography>
          {openPipelineLink}
        </Stack>
      ) : (
        <Stack gap="100">
          {stages.map((s) => {
            const key = `${s.phaseId}#${s.attempt}`;
            const isOpen = openKey === key;
            const rowLive = s.status === "running";
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
                    {s.verdict && (
                      <Tag
                        data-testid={`stage-verdict-${s.verdict}`}
                        size="sm"
                        tone={s.verdict === "pass" ? "ok" : "warn"}
                      >
                        {t(`verdict.${s.verdict}`)}
                      </Tag>
                    )}
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
                {isOpen && (
                  <StageLog live={rowLive} phaseId={s.phaseId} pipelineRunId={pipelineRunId} />
                )}
              </Stack>
            );
          })}
          {openPipelineLink}
        </Stack>
      )}
    </HudPanel>
  );
}
