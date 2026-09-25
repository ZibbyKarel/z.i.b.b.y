"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Breadcrumb,
  Container,
  EmptyState,
  Stack,
  StatePill,
  type SubNavLinkComponent,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { TaskRun } from "@zibby/contracts";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useProjectsQuery } from "../../projects";
import { GoalDetailPanel } from "../../runs/components/GoalDetailPanel";
import { useRunsQuery } from "../../runs";
import { useGoalQuery } from "../queries";
import { goalStateTone } from "../goal";

export interface GoalDetailScreenProps {
  goalId: string;
}

function latestRunFor(goalId: string, runs: readonly TaskRun[]): TaskRun | undefined {
  const forGoal = runs.filter((r) => r.kind === "goal" && r.goalId === goalId);
  const live = forGoal.find((r) => r.status === "running" || r.status === "parked");
  if (live) return live;
  return [...forGoal].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

/**
 * `/work/goals/[id]` (ZB-06) — the loop's detail: objective, maker/verifier,
 * project link, and its most recent run's iteration timeline (folded maker/
 * verifier logs, resume-with-note), reusing {@link GoalDetailPanel} from the
 * runs feature verbatim rather than duplicating its logic.
 */
export function GoalDetailScreen({ goalId }: GoalDetailScreenProps) {
  const t = useTranslations("goals");
  const router = useRouter();

  const goalQuery = useGoalQuery(goalId);
  const { data: projects = [] } = useProjectsQuery();
  const { runs, isPending: runsPending } = useRunsQuery();

  if (goalQuery.isPending || runsPending) return <QueryLoading />;
  if (goalQuery.isError || !goalQuery.data) {
    return <QueryError onRetry={() => void goalQuery.refetch()} />;
  }

  const goal = goalQuery.data;
  const run = latestRunFor(goal.id, runs);
  const project = goal.projectId ? projects.find((p) => p.id === goal.projectId) : undefined;

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Breadcrumb
          items={[{ label: t("title"), href: "/work/goals" }, { label: goal.id }]}
          linkComponent={Link as SubNavLinkComponent}
        />

        <Stack wrap align="baseline" direction="row" gap="150">
          <Typography type="h1">{goal.name ?? goal.objective}</Typography>
          <StatePill
            label={t(`stateTone.${goalStateTone(run?.status)}`)}
            state={goalStateTone(run?.status)}
          />
        </Stack>

        <Stack direction="row" gap="100">
          <Tag uppercase tone="neutral">{`Maker · ${goal.maker.id}`}</Tag>
          <Tag uppercase tone="neutral">{`Verifier · ${goal.verifier.kind}`}</Tag>
          {project && (
            <Tag
              uppercase
              onClick={() => router.push(`/work/projects/${project.id}` as Route)}
              tone="neutral"
            >
              {project.name}
            </Tag>
          )}
        </Stack>

        <Typography type="bodySm" variant="secondary">
          {goal.objective}
        </Typography>

        {run ? (
          <GoalDetailPanel run={run} />
        ) : (
          <EmptyState body={t("detail.noRunsBody")} title={t("detail.noRunsTitle")} />
        )}
      </Stack>
    </Container>
  );
}
