"use client";

import { Button, Panel, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useProjectsQuery } from "../../projects/queries";
import { useCreateTaskMutation } from "../../tasks/mutations";
import { useTeamKbIngestQuery } from "../queries";

/** The stored workflow that compiles a team KB's new sources into its wiki (PR output). */
export const TEAM_KB_INGEST_WORKFLOW_ID = "team-kb-ingest";

export enum TeamKbIngestTestId {
  Run = "distill-ingest-run",
  Log = "distill-ingest-log",
  NoProject = "distill-ingest-no-project",
  Runs = "distill-ingest-runs",
}

/**
 * The team-KB counterpart of distillation: the ingest workflow. Shows the tail of the
 * KB's own `_meta/log.md` and starts `team-kb-ingest` on the project registered at the
 * KB path through the existing create-task mutation (explicit workflow target + the
 * project's path, exactly like the New Task screen). No registered project → no run.
 */
export function TeamKbIngest({ teamId }: { teamId: string }) {
  const t = useTranslations("knowledge.distill.ingest");
  const router = useRouter();
  const ingest = useTeamKbIngestQuery(teamId);
  const { data: projects = [] } = useProjectsQuery();
  const createTask = useCreateTaskMutation();

  if (ingest.isPending) return <QueryLoading />;
  if (ingest.isError) return <QueryError onRetry={() => void ingest.refetch()} />;

  const { projectId, log } = ingest.data ?? { projectId: null, log: [] };
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;

  if (!projectId) {
    return (
      <Stack data-testid={TeamKbIngestTestId.NoProject}>
        <EmptyState
          description={t("noProjectDescription")}
          glyph="brain"
          title={t("noProjectTitle")}
        />
      </Stack>
    );
  }

  const run = () =>
    createTask.mutate(
      {
        body: {
          title: t("workflowName"),
          text: t("runText", { team: teamId }),
          paths: project?.path ? [project.path] : [],
          target: { kind: "workflow", id: TEAM_KB_INGEST_WORKFLOW_ID, name: t("workflowName") },
        },
      },
      { onSuccess: (res) => router.push(`/work/tasks/${res.body.task.id}` as Route) },
    );

  return (
    <Panel
      header={t("title")}
      headerEnd={
        <Stack align="center" direction="row" gap="100">
          <Button
            data-testid={TeamKbIngestTestId.Runs}
            intent="ghost"
            onClick={() => router.push("/work/tasks" as Route)}
            size="sm"
          >
            {t("runsLink")}
          </Button>
          <Button
            data-testid={TeamKbIngestTestId.Run}
            icon="play"
            intent="primary"
            loading={createTask.isPending}
            onClick={run}
            size="sm"
          >
            {createTask.isPending ? t("running") : t("run")}
          </Button>
        </Stack>
      }
      padding="250"
    >
      <Stack gap="200">
        <Typography size="sm" type="note" variant="secondary">
          {t("description")}
        </Typography>
        <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
          {t("log")}
        </Typography>
        <Stack data-testid={TeamKbIngestTestId.Log} gap="75">
          {log.length === 0 ? (
            <Typography mono size="xs" type="note" variant="tertiary">
              {t("logEmpty")}
            </Typography>
          ) : (
            log.map((l, i) => (
              <Typography mono key={`${i}-${l.line}`} size="xs" type="note" variant="secondary">
                {l.line}
              </Typography>
            ))
          )}
        </Stack>
      </Stack>
    </Panel>
  );
}
