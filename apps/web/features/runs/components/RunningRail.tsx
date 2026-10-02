"use client";

import { Button, Card, Container, IconTile, Rail, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useResumeTaskRunMutation, useStopTaskRunMutation } from "../mutations";
import { useRunGlyphMap, useRunsQuery } from "../queries/useRunsQuery";
import { type RunView, isStoppableRun, runGlyph, runStateTone, runTitle } from "../run";
import { RunStateBadge } from "./RunStateBadge";

export enum RunningRailTestId {
  Card = "running-rail-card",
  Stop = "running-rail-stop",
  Restart = "running-rail-restart",
}

const LIVE_STATES = new Set(["pending", "running", "awaiting-approval", "paused-limit"]);

/** Where a card leads: the task detail when the run came from a task, else the run detail. */
export function runningRunHref(run: RunView): Route {
  const taskId = run.kind === "scheduled" ? run.runId : run.taskId;
  return (taskId ? `/work/tasks/${taskId}` : `/activity/runs/${run.runId}`) as Route;
}

/**
 * The rail's "RUNNING" section under "Needs you" — every live run as a card that
 * opens its task detail, with Stop and (agent runs) Restart. Restart = stop, then
 * the backend's re-run of the interrupted agent run (`--resume` of its session).
 */
export function RunningRail() {
  const t = useTranslations("shell");
  const tRuns = useTranslations("runs");
  const router = useRouter();
  const { runs } = useRunsQuery();
  const glyphById = useRunGlyphMap();
  const stopRun = useStopTaskRunMutation();
  const resumeRun = useResumeTaskRunMutation();
  const live = runs.filter((r) => LIVE_STATES.has(r.status));

  const stop = (run: RunView) => stopRun.mutate({ params: { runId: run.runId }, body: {} });
  const restart = (run: RunView) =>
    stopRun.mutate(
      { params: { runId: run.runId }, body: {} },
      { onSuccess: () => resumeRun.mutate({ params: { runId: run.runId }, body: {} }) },
    );
  const busy = (run: RunView) =>
    (stopRun.isPending && stopRun.variables?.params.runId === run.runId) ||
    (resumeRun.isPending && resumeRun.variables?.params.runId === run.runId);

  return (
    <Rail
      count={live.length}
      empty={
        <Typography type="note" variant="tertiary">
          {t("runningEmpty")}
        </Typography>
      }
      title={t("running")}
    >
      {live.length === 0
        ? undefined
        : live.map((run) => {
            const tone = runStateTone(run.status);
            const stoppable = isStoppableRun(run);
            return (
              <Card
                interactive
                data-testid={RunningRailTestId.Card}
                edge={tone}
                key={run.runId}
                living={run.status === "running"}
                onClick={() => router.push(runningRunHref(run))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target === e.currentTarget)
                    router.push(runningRunHref(run));
                }}
                role="link"
                tabIndex={0}
              >
                <Container padding="150">
                  <Stack gap="100">
                    <Stack align="center" direction="row" gap="100">
                      <IconTile glyph={runGlyph(run, glyphById)} size="sm" />
                      <Container grow minW0>
                        <Typography mono truncate type="note" weight="bold">
                          {runTitle(run)}
                        </Typography>
                      </Container>
                    </Stack>
                    <Stack align="center" direction="row" gap="50" justify="between">
                      <RunStateBadge label={tRuns(`state.${run.status}`)} status={run.status} />
                      {stoppable && (
                        <Stack direction="row" gap="50">
                          {run.kind === "agent" && (
                            <Button
                              aria-label={t("runningRestart")}
                              data-testid={RunningRailTestId.Restart}
                              disabled={busy(run)}
                              icon="retry"
                              intent="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                restart(run);
                              }}
                              size="sm"
                            />
                          )}
                          <Button
                            aria-label={t("runningStop")}
                            data-testid={RunningRailTestId.Stop}
                            disabled={busy(run)}
                            icon="stop"
                            intent="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              stop(run);
                            }}
                            size="sm"
                          />
                        </Stack>
                      )}
                    </Stack>
                  </Stack>
                </Container>
              </Card>
            );
          })}
    </Rail>
  );
}
