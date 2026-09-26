"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Container, EmptyState, GoalCard, Grid, Stack, Typography } from "@zibby/design-system";
import type { Goal, TaskRun } from "@zibby/contracts";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useProjectsQuery } from "../../projects";
import { useRunsQuery, useStopTaskRunMutation } from "../../runs";
import { useResumeGoalRunMutation } from "../mutations";
import { useGoalsQuery } from "../queries";
import { goalStateTone, latestIterationSummary } from "../goal";

/** The most recent run for a goal — running/parked first, else the newest by start time. */
function latestRunFor(goalId: string, runs: readonly TaskRun[]): TaskRun | undefined {
  const forGoal = runs.filter((r) => r.kind === "goal" && r.goalId === goalId);
  const live = forGoal.find((r) => r.status === "running" || r.status === "parked");
  if (live) return live;
  return [...forGoal].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

/**
 * `/work/goals` (ZB-06) — a grid of {@link GoalCard}s, one per goal definition,
 * enriched with its most recent run (state, iterations used, latest verdict).
 * A goal that has never run shows as idle with an empty run budget.
 */
export function GoalsListScreen() {
  const t = useTranslations("goals");
  const router = useRouter();

  const goalsQuery = useGoalsQuery();
  const { data: projects = [] } = useProjectsQuery();
  const { runs, isPending: runsPending } = useRunsQuery();
  const resumeRun = useResumeGoalRunMutation();
  const stopRun = useStopTaskRunMutation();

  const goals: Goal[] = goalsQuery.data ?? [];
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const openGoal = (id: string) => router.push(`/work/goals/${id}` as Route);

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("eyebrow")}
          </Typography>
          <Typography type="h1">{t("title")}</Typography>
          <Typography size="sm" type="note" variant="secondary">
            {t("subtitle")}
          </Typography>
        </Stack>

        {goalsQuery.isPending || runsPending ? (
          <QueryLoading />
        ) : goalsQuery.isError ? (
          <QueryError onRetry={() => void goalsQuery.refetch()} />
        ) : goals.length === 0 ? (
          <EmptyState body={t("emptyBody")} title={t("emptyTitle")} />
        ) : (
          <Grid cols={1} gap="150" lg={2}>
            {goals.map((goal) => {
              const run = latestRunFor(goal.id, runs);
              const used = run?.iterations?.length ?? 0;
              const projectLabel = goal.projectId
                ? (projectNameById.get(goal.projectId) ?? goal.projectId)
                : t("noProject");
              return (
                <GoalCard
                  eyebrow={`${goal.id} · ${projectLabel.toUpperCase()}`}
                  iterationSummary={run ? latestIterationSummary(run.iterations ?? []) : undefined}
                  key={goal.id}
                  makerLabel={goal.maker.id}
                  max={goal.maxIterations}
                  onOpen={() => openGoal(goal.id)}
                  onResume={
                    run?.status === "parked"
                      ? () => resumeRun.mutate({ params: { runId: run.runId }, body: {} })
                      : undefined
                  }
                  onStop={
                    run?.status === "running"
                      ? () => stopRun.mutate({ params: { runId: run.runId }, body: {} })
                      : undefined
                  }
                  resumeLabel={t("resume")}
                  state={goalStateTone(run?.status)}
                  stopLabel={t("stop")}
                  title={goal.name ?? goal.objective}
                  used={used}
                  verifierLabel={goal.verifier.kind}
                />
              );
            })}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}
