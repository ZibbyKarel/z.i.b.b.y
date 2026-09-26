"use client";

import { Container, Panel, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { RunDetail } from "../components/RunDetail";
import { useTaskRunQuery } from "../queries/useTaskRunQuery";
import { useRunAvatarMap, useRunGlyphMap } from "../queries/useRunsQuery";
import { runAvatar, runGlyph } from "../run";
import { useRunActions } from "../useRunActions";

export interface ActivityRunDetailScreenProps {
  runId: string;
}

/**
 * `/activity/runs/[runId]` (ZB-07) — the run detail moved out of the ex-`/archiv`
 * master/detail split into its own route: stop/resume, log, stage timeline and
 * artifacts, unchanged (`RunDetail` itself is reused as-is).
 */
export function ActivityRunDetailScreen({ runId }: ActivityRunDetailScreenProps) {
  const t = useTranslations("archive");
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const glyphById = useRunGlyphMap();
  const avatarById = useRunAvatarMap();

  const { data: run, isPending, isError, refetch } = useTaskRunQuery(runId);
  const { stop, stopping, resume, resuming, remove, deleting } = useRunActions(
    (resumedRunId) => router.push(`/activity/runs/${resumedRunId}`),
    () => router.push("/activity/runs"),
  );

  if (isPending) {
    return (
      <Container padding={["300", "350"]}>
        <QueryLoading />
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

  return (
    <Container padding={["300", "350"]}>
      <RunDetail
        avatar={runAvatar(run, avatarById)}
        deleting={deleting}
        glyph={runGlyph(run, glyphById)}
        now={now}
        onDelete={() => remove(run.runId, run.kind)}
        onResume={() => resume(run)}
        onStop={() => stop(run)}
        resuming={resuming}
        run={run}
        stopping={stopping}
      />
    </Container>
  );
}
