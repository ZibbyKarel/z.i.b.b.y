"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ButtonGroup,
  Container,
  Grid,
  Icon,
  Stack,
  Typography,
} from "@zibby/design-system";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { useCancelScheduledTaskMutation } from "../tasks/mutations";
import { useRunGlyphMap, useRunsQuery } from "./queries/useRunsQuery";
import { type FeedStatus, type RunView, runGlyph } from "./run";
import { TaskCard } from "./components/TaskCard";
import { RunDetail } from "./components/RunDetail";
import {
  useDeleteAgentRunMutation,
  useDeletePipelineRunMutation,
  useStopAgentMutation,
} from "./mutations";

type Filter = "all" | FeedStatus;
const FILTERS: Filter[] = [
  "all",
  "running",
  "awaiting-approval",
  "scheduled",
  "done",
  "error",
  "interrupted",
];

export function Screen() {
  const t = useTranslations("runs");
  const { runs } = useRunsQuery();
  const glyphById = useRunGlyphMap();
  // A render-stable "now" for coarse relative times (Date.now() in render is impure).
  const [now] = useState(() => Date.now());

  // Deep-link the active tab via `?filter=` (e.g. RunModal points here at "running")
  // and the selected run via `?run=` (the New Task dialog lands on its fresh run).
  const searchParams = useSearchParams();
  const paramFilter = searchParams.get("filter");
  const [filter, setFilter] = useState<Filter>(
    FILTERS.includes(paramFilter as Filter) ? (paramFilter as Filter) : "all",
  );
  const [selId, setSelId] = useState<string | null>(searchParams.get("run"));

  const stopAgent = useStopAgentMutation();

  // Deleting a run erases its on-disk artifacts; clearing the selection first keeps
  // the detail pane from briefly pointing at a now-gone run before the refetch.
  // A scheduled task has no artifacts yet — "delete" cancels it instead.
  const deleteAgent = useDeleteAgentRunMutation();
  const deletePipeline = useDeletePipelineRunMutation();
  const cancelTask = useCancelScheduledTaskMutation();

  const list =
    filter === "all" ? runs : runs.filter((r) => r.status === filter);
  const selected =
    runs.find((r) => r.runId === selId) ?? list[0] ?? runs[0] ?? null;

  const count = (f: Filter) =>
    f === "all" ? runs.length : runs.filter((r) => r.status === f).length;
  const ago = (n: number, unit: string) =>
    n === 0 ? t("agoNow") : unit === "m" ? t("agoM", { n }) : t("agoH", { n });

  // Feed time label: runs read as "ago"; a waiting scheduled task fires in the
  // future, so it reads as "in …" instead.
  const timeLabel = (r: RunView) => {
    const inMin = Math.floor((Date.parse(r.startedAt) - now) / 60000);
    if (r.status === "scheduled" && inMin >= 1) {
      return inMin < 60
        ? t("inM", { n: inMin })
        : t("inH", { n: Math.floor(inMin / 60) });
    }
    return relative(r.startedAt, now, ago);
  };

  const stop = (runId: string, kind: string) => {
    if (kind === "agent") stopAgent.mutate({ params: { runId }, body: {} });
  };

  const remove = (runId: string, kind: string) => {
    setSelId(null);
    if (kind === "agent") deleteAgent.mutate({ params: { runId } });
    else if (kind === "pipeline")
      deletePipeline.mutate({ params: { pipelineRunId: runId } });
    else if (kind === "scheduled") cancelTask.mutate({ params: { id: runId } });
  };

  const deleting =
    deleteAgent.isPending || deletePipeline.isPending || cancelTask.isPending;

  const running = count("running");
  const awaiting = count("awaiting-approval");

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <ButtonGroup
              ariaLabel={t("title")}
              onChange={(v) => setFilter(v as Filter)}
              options={FILTERS.map((f) => ({
                id: f,
                label: f === "all" ? t("filterAll") : t(`state.${f}`),
                trailing: count(f),
              }))}
              value={filter}
            />
          }
          subtitle={t("summary", { running, awaiting, total: runs.length })}
          title={t("title")}
        />

        {runs.length === 0 ? (
          <EmptyState
            description={t("emptyDesc")}
            glyph="pulse"
            title={t("emptyTitle")}
          />
        ) : (
          <Grid align="start" gap="300" sidebar="left">
            <Stack gap="100">
              {list.length > 0 ? (
                list.map((r) => (
                  <TaskCard
                    glyph={runGlyph(r, glyphById)}
                    key={r.runId}
                    onSelect={setSelId}
                    run={r}
                    selected={selected?.runId === r.runId}
                    startedLabel={timeLabel(r)}
                    stateLabel={t(`state.${r.status}`)}
                  />
                ))
              ) : (
                <HudPanel padding="250">
                  <Typography mono size="xs" type="note" variant="tertiary">
                    {t("emptyFilter")}
                  </Typography>
                </HudPanel>
              )}
            </Stack>

            {selected ? (
              <RunDetail
                deleting={deleting}
                glyph={runGlyph(selected, glyphById)}
                key={selected.runId}
                now={now}
                onDelete={() => remove(selected.runId, selected.kind)}
                onStop={() => stop(selected.runId, selected.kind)}
                run={selected}
                stopping={stopAgent.isPending}
              />
            ) : (
              <HudPanel padding="500">
                <Container textAlign="center">
                  <Stack align="center" gap="100">
                    <Icon name="pulse" size="xl" tone="faint" />
                    <Typography mono size="sm" type="note" variant="secondary">
                      {t("selectHint")}
                    </Typography>
                  </Stack>
                </Container>
              </HudPanel>
            )}
          </Grid>
        )}
      </Stack>
    </PageContainer>
  );
}

// Local relative-time wrapper (keeps the `ago` resolver close to its labels).
function relative(
  iso: string,
  now: number,
  ago: (n: number, unit: string) => string,
): string {
  const min = Math.floor(Math.max(0, now - Date.parse(iso)) / 60000);
  if (min < 1) return ago(0, "m");
  if (min < 60) return ago(min, "m");
  return ago(Math.floor(min / 60), "h");
}
