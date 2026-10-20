"use client";

import { Button, Container, EmptyState, Panel, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { RunDetail } from "../components/RunDetail";
import { useTaskRunQuery } from "../queries/useTaskRunQuery";

export interface ActivityRunDetailScreenProps {
  runId: string;
}

/** `/activity/runs/[runId]` — the run detail on its own route; a missing run reads as not found. */
export function ActivityRunDetailScreen({ runId }: ActivityRunDetailScreenProps) {
  const t = useTranslations("archive");
  const tRuns = useTranslations("runs.detail.notFound");
  const router = useRouter();
  const { data: run, isPending, isError, error, refetch } = useTaskRunQuery(runId);

  if (isPending) {
    return (
      <Container padding={["300", "350"]}>
        <QueryLoading />
      </Container>
    );
  }

  const notFound = isError && !!error && "status" in error && error.status === 404;
  if (notFound) {
    return (
      <Container padding={["300", "350"]}>
        <EmptyState
          action={<Button onClick={() => router.push("/activity/runs")}>{tRuns("back")}</Button>}
          body={tRuns("body", { id: runId })}
          title={tRuns("title")}
        />
      </Container>
    );
  }

  if (isError || !run) {
    return (
      <Container padding={["300", "350"]}>
        {isError ? (
          <QueryError onRetry={() => void refetch()} />
        ) : (
          <Panel padding="500">
            <Container textAlign="center">
              <Stack gap="75">
                <Typography mono size="sm" type="note" variant="secondary">
                  {t("selectHint")}
                </Typography>
              </Stack>
            </Container>
          </Panel>
        )}
      </Container>
    );
  }

  return <RunDetail run={run} />;
}
