"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  CodeBlock,
  Icon,
  Progress,
  Stack,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useGoalsQuery } from "../../goals/queries";
import { useResumeGoalRunMutation } from "../../goals/mutations";
import { usePipelineRunQuery } from "../../pipelines/queries";
import type { RunView } from "../run";
import { PipelineStageTimeline } from "./PipelineStageTimeline";
import { RunLogStream } from "./RunLogStream";

export interface GoalDetailPanelProps {
  run: RunView;
}

/**
 * The goal-loop detail surface (Phase 10.4): a cost bar (iterations-used /
 * maxIterations — the goal's only cost currency), a per-iteration timeline (maker
 * status + verifier verdict), and, when the goal is parked, the resume-with-note
 * panel (the same UX as a parked pipeline run, distinct endpoint).
 */
export function GoalDetailPanel({ run }: GoalDetailPanelProps) {
  const t = useTranslations("runs");
  const { data: goals = [] } = useGoalsQuery();
  const resume = useResumeGoalRunMutation();
  const [note, setNote] = useState("");
  // Which iteration's child log is expanded — at most one open ⇒ at most one live
  // poller mounted at a time. Phase 27: the folded maker/verifier runs (Phase 26
  // removed their feed card) stay answerable from the task detail.
  const [openLog, setOpenLog] = useState<number | null>(null);

  const iterations = run.iterations ?? [];
  // Phase 29: when the *open* iteration's maker is a pipeline, fetch that maker run's
  // aggregate so its stage timeline can render inline (one query — only the open row).
  const openIter = iterations.find((it) => it.index === openLog);
  const openMakerPipelineId =
    openIter?.makerKind === "pipeline" ? openIter.makerRunRef ?? null : null;
  const { data: makerPipeline } = usePipelineRunQuery(openMakerPipelineId);
  const goal = goals.find((g) => g.id === run.goalId);
  const maxIterations = goal?.maxIterations ?? iterations.length;
  const used = iterations.length;
  const pct = maxIterations > 0 ? Math.min(100, (used / maxIterations) * 100) : 0;

  // Phase 14.1 — the goal's OWN windowed run budget (13.1): count iterations whose
  // startedAt falls in the rolling daily/weekly window, mirroring the backend guard.
  // `now` is read in an effect (not during render — React purity), so the bar paints a
  // tick after mount; the window (hours/days) is stable over the panel's lifetime.
  const DAY = 24 * 60 * 60 * 1000;
  // Read "now" once via a lazy useState initializer (memoized — not re-read each render,
  // so React purity is satisfied); the window (hours/days) is stable over the panel's life.
  const [now] = useState(() => Date.now());
  const within = (ms: number) =>
    iterations.filter((it) => now - new Date(it.startedAt).getTime() < ms).length;
  const budget =
    goal?.budget?.dailyRuns !== undefined
      ? { cap: goal.budget.dailyRuns, n: within(DAY), window: t("goalBudgetDaily") }
      : goal?.budget?.weeklyRuns !== undefined
        ? { cap: goal.budget.weeklyRuns, n: within(7 * DAY), window: t("goalBudgetWeekly") }
        : null;
  const budgetPct = budget && budget.cap > 0 ? Math.min(100, (budget.n / budget.cap) * 100) : 0;

  // Phase 14.1 — a human-legible park reason (was a raw enum) + an optional next-step hint.
  const parkedReason = run.goalParkedReason ?? "iterations";
  const parkedHint =
    parkedReason === "verifier-scope" || parkedReason === "awaiting-resume"
      ? t(`goalParkedHint.${parkedReason}`)
      : null;

  return (
    <Stack gap="200">
      <HudPanel padding="250" title={t("goalCost")}>
        <Stack gap="100">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Typography mono size="xs" type="note" variant="secondary">
              {t("goalIterations", { used, max: maxIterations })}
            </Typography>
          </Stack>
          <Progress label={t("goalCost")} tone={pct >= 100 ? "warn" : "accent"} value={pct} />
        </Stack>
      </HudPanel>

      {budget && (
        <HudPanel padding="250" title={t("goalBudget")}>
          <Stack gap="100">
            <Typography mono size="xs" type="note" variant="secondary">
              {t("goalBudgetUsed", { used: budget.n, cap: budget.cap, window: budget.window })}
            </Typography>
            <Progress label={t("goalBudget")} tone={budgetPct >= 100 ? "warn" : "accent"} value={budgetPct} />
          </Stack>
        </HudPanel>
      )}

      <HudPanel padding="250" title={t("goalTimeline")}>
        {iterations.length === 0 ? (
          <Typography mono size="xs" type="note" variant="tertiary">
            {t("goalNoIterations")}
          </Typography>
        ) : (
          <Stack gap="100">
            {iterations.map((it) => {
              const isOpen = openLog === it.index;
              // The folded child runs whose log this row can reveal (Phase 27).
              const hasLog = Boolean(
                it.makerRunRef || it.verifier.runRef || it.verifier.output,
              );
              return (
                <Stack gap="50" key={it.index}>
                  <Stack align="center" direction="row" gap="100" justify="between">
                    <Stack align="center" direction="row" gap="100">
                      <Typography mono size="xs" type="note" variant="secondary" weight="semibold">
                        {t("goalIteration", { n: it.index + 1 })}
                      </Typography>
                      {/* The execution kind of this iteration's maker (agent vs pipeline)
                          — "what it runs as" lives in the task detail, not a 2nd feed card. */}
                      <Stack align="center" direction="row" gap="50">
                        <Icon
                          name={it.makerKind === "agent" ? "bot" : "flow"}
                          size="xs"
                          tone="accent"
                        />
                        <Typography mono size="2xs" type="note" variant="tertiary">
                          {t(`goalMakerKind.${it.makerKind}`)}
                        </Typography>
                      </Stack>
                      <Typography mono size="2xs" type="note" variant="tertiary">
                        {t(`goalMakerStatus.${it.status}`)}
                      </Typography>
                    </Stack>
                    <Stack align="center" direction="row" gap="100">
                      <Stack align="center" direction="row" gap="50">
                        <Icon
                          name={it.verifier.satisfied ? "ok" : "x"}
                          size="xs"
                          tone={it.verifier.satisfied ? "ok" : "bad"}
                        />
                        <Typography mono size="2xs" type="note" variant="tertiary">
                          {it.verifier.satisfied ? t("goalVerifierPass") : t("goalVerifierFail")}
                        </Typography>
                      </Stack>
                      {/* Drill into the folded child's log — agent maker + claude verifier
                          run logs + the verifier verdict (always answerable, Phase 27). */}
                      {hasLog && (
                        <Button
                          icon="code"
                          intent="ghost"
                          onClick={() => setOpenLog(isOpen ? null : it.index)}
                          size="sm"
                        >
                          {t("goalOpenLog")}
                        </Button>
                      )}
                    </Stack>
                  </Stack>

                  {isOpen && (
                    <Stack gap="100">
                      {it.makerKind === "agent" && it.makerRunRef ? (
                        <Stack gap="50">
                          <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
                            {t("goalMakerLog")}
                          </Typography>
                          <RunLogStream
                            key={it.makerRunRef}
                            linesLabel={(n) => t("lines", { n })}
                            live={it.status === "running"}
                            liveLabel={t("liveLog")}
                            logLabel={t("log")}
                            runId={it.makerRunRef}
                          />
                        </Stack>
                      ) : it.makerKind === "pipeline" && it.makerRunRef ? (
                        // Phase 29: the pipeline maker's own stage timeline, inline (its
                        // child run was folded out of the feed in Phase 26).
                        makerPipeline ? (
                          <PipelineStageTimeline
                            currentStage={makerPipeline.currentStage}
                            live={makerPipeline.status === "running"}
                            owner={makerPipeline.owner}
                            pipelineRunId={it.makerRunRef}
                            stageRuns={makerPipeline.stageRuns}
                          />
                        ) : (
                          <Typography mono size="2xs" type="note" variant="tertiary">
                            {t("stageLoading")}
                          </Typography>
                        )
                      ) : null}

                      {it.verifier.kind === "claude" && it.verifier.runRef && (
                        <Stack gap="50">
                          <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
                            {t("goalVerifierLog")}
                          </Typography>
                          <RunLogStream
                            key={it.verifier.runRef}
                            linesLabel={(n) => t("lines", { n })}
                            live={it.status === "running"}
                            liveLabel={t("liveLog")}
                            logLabel={t("log")}
                            runId={it.verifier.runRef}
                          />
                        </Stack>
                      )}

                      {it.verifier.output && (
                        <Stack gap="50">
                          <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
                            {t("goalVerifierVerdict")}
                          </Typography>
                          <CodeBlock maxHeight="md" text={it.verifier.output} />
                        </Stack>
                      )}
                    </Stack>
                  )}
                </Stack>
              );
            })}
          </Stack>
        )}
      </HudPanel>

      {run.status === "parked" && run.goalParked && (
        <HudPanel padding="250" title={t("parkedContext")} tone="warn">
          <Stack gap="200">
            <Stack gap="50">
              <Typography mono size="xs" type="note" variant="secondary" weight="semibold">
                {t(`goalParkedReason.${parkedReason}`)}
              </Typography>
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("goalParkedSummary", { attempts: run.goalParked.attempts })}
              </Typography>
              {parkedHint && (
                <Typography mono size="2xs" type="note" variant="tertiary">
                  {parkedHint}
                </Typography>
              )}
            </Stack>
            {iterations.length > 0 && iterations[iterations.length - 1]?.verifier.output && (
              <CodeBlock maxHeight="md" text={iterations[iterations.length - 1]!.verifier.output} />
            )}
            <TextAreaField
              label={t("resumeNote")}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("resumeNotePlaceholder")}
              value={note}
            />
            <Stack direction="row" justify="end">
              <Button
                disabled={resume.isPending}
                icon="run"
                onClick={() =>
                  resume.mutate({
                    params: { runId: run.runId },
                    body: { note: note.trim() || undefined },
                  })
                }
                size="sm"
              >
                {t("resumeWithNote")}
              </Button>
            </Stack>
          </Stack>
        </HudPanel>
      )}
    </Stack>
  );
}
