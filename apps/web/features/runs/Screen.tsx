"use client";

import { Container, Dropdown, Grid, Icon, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { ProjectScopeChip, useActiveProject, useProjectsQuery } from "../projects";
import { useCancelScheduledTaskMutation } from "../tasks";
import { RunDetail } from "./components/RunDetail";
import { TaskCard } from "./components/TaskCard";
import {
  useDeleteAgentRunMutation,
  useDeletePipelineRunMutation,
  useStopAgentMutation,
} from "./mutations";
import { useRunGlyphMap, useRunsQuery } from "./queries/useRunsQuery";
import { type FeedStatus, type RunView, findSelectedRun, runGlyph } from "./run";

// No synthetic "all" entry — an empty selection already reads as "every state"
// (see `list` below), which is what the multi-select's own placeholder communicates.
const STATUSES: FeedStatus[] = [
  "running",
  "pending",
  "awaiting-approval",
  "paused-limit",
  "parked",
  "held",
  "queued",
  "scheduled",
  "done",
  "error",
  "interrupted",
];

export function Screen() {
  const t = useTranslations("runs");
  const {
    runs: allRuns,
    isPending: runsPending,
    isError: runsError,
    refetch: refetchRuns,
  } = useRunsQuery();
  const { data: projects = [] } = useProjectsQuery();
  // Fáze 11: the app-wide active project scopes the feed FIRST — only runs
  // attributed to it remain (unattributed runs read as global and show only
  // under "Všechny projekty"). Client-side over the shared cache, so switching
  // projects is instant.
  const { activeProjectId } = useActiveProject();
  const runs =
    activeProjectId === null ? allRuns : allRuns.filter((r) => r.projectId === activeProjectId);
  const glyphById = useRunGlyphMap();
  // A render-stable "now" for coarse relative times (Date.now() in render is impure).
  const [now] = useState(() => Date.now());

  // Deep-link the active filter via `?filter=` (e.g. ApprovalsPanel/ParkedRunsPanel
  // point here at a single state — "awaiting-approval" / "parked") and the selected
  // run via `?run=` (the New Task dialog lands on its fresh run). The multi-select
  // seeds from that one value; an empty selection means "every state" (see `list`).
  const searchParams = useSearchParams();
  // `?filter=` seeds the status multi-select. A single value (ApprovalsPanel/
  // ParkedRunsPanel) and a comma-separated set (a project summary bucket links with
  // every state in its bucket) both round-trip; unknown tokens are dropped.
  const paramFilter = searchParams.get("filter");
  const [filter, setFilter] = useState<FeedStatus[]>(
    paramFilter
      ? paramFilter.split(",").filter((s): s is FeedStatus => STATUSES.includes(s as FeedStatus))
      : [],
  );
  // `?project=<id>` scopes the whole feed to one engagement (the project detail
  // summary links here); "" means every project.
  const [projectFilter, setProjectFilter] = useState<string>(searchParams.get("project") ?? "");
  const [selId, setSelId] = useState<string | null>(searchParams.get("run"));

  const stopAgent = useStopAgentMutation();

  // Deleting a run erases its on-disk artifacts; clearing the selection first keeps
  // the detail pane from briefly pointing at a now-gone run before the refetch.
  // A scheduled task has no artifacts yet — "delete" cancels it instead.
  const deleteAgent = useDeleteAgentRunMutation();
  const deletePipeline = useDeletePipelineRunMutation();
  const cancelTask = useCancelScheduledTaskMutation();

  // Project scopes the whole feed; status narrows within that scope. Keeping them
  // ordered this way means the status counts and header stats read the selected
  // project, not the global feed.
  const scoped = projectFilter === "" ? runs : runs.filter((r) => r.projectId === projectFilter);
  const list = filter.length === 0 ? scoped : scoped.filter((r) => filter.includes(r.status));
  // Keep the detail in sync with the filtered list: a selection only counts when
  // it's actually visible, and we fall back to the first row of the *current* filter —
  // never to runs[0], which would show an out-of-filter run's detail. Matching on
  // `taskId` too keeps the selection through the `pending → dispatched` identity shift
  // (see findSelectedRun).
  const selected = findSelectedRun(list, selId);

  const count = (s: FeedStatus) => scoped.filter((r) => r.status === s).length;
  const ago = (n: number, unit: string) =>
    n === 0 ? t("agoNow") : unit === "m" ? t("agoM", { n }) : t("agoH", { n });

  // Feed time label: runs read as "ago"; a waiting scheduled task fires in the
  // future, so it reads as "in …" instead.
  const timeLabel = (r: RunView) => {
    const inMin = Math.floor((Date.parse(r.startedAt) - now) / 60000);
    if (r.status === "scheduled" && inMin >= 1) {
      return inMin < 60 ? t("inM", { n: inMin }) : t("inH", { n: Math.floor(inMin / 60) });
    }
    return relative(r.startedAt, now, ago);
  };

  const stop = (runId: string, kind: string) => {
    if (kind === "agent") stopAgent.mutate({ params: { runId }, body: {} });
  };

  const remove = (runId: string, kind: string) => {
    setSelId(null);
    if (kind === "agent") deleteAgent.mutate({ params: { runId } });
    else if (kind === "pipeline") deletePipeline.mutate({ params: { runId } });
    else if (kind === "scheduled") cancelTask.mutate({ params: { id: runId } });
  };

  const deleting = deleteAgent.isPending || deletePipeline.isPending || cancelTask.isPending;

  const running = count("running");
  const awaiting = count("awaiting-approval");

  // Honest load states (Phase 18.2): the feed used to swallow both via `?? []` — a
  // failed fetch read as an honestly-empty workspace instead of an outage.
  if (runsPending) {
    return (
      <PageContainer>
        <Stack gap="250">
          <PageHeader title={t("title")} />
          <QueryLoading />
        </Stack>
      </PageContainer>
    );
  }

  if (runsError) {
    return (
      <PageContainer>
        <Stack gap="250">
          <PageHeader title={t("title")} />
          <QueryError onRetry={() => void refetchRuns()} />
        </Stack>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Stack gap="250">
        <PageHeader
          actions={
            <Stack align="center" direction="row" gap="150">
              {/* Fáze 11: subtle indication that the feed is scoped to the active
                  project, so an empty filtered list is never confusing. */}
              <ProjectScopeChip />
              <Container width="15rem">
                <Dropdown<string>
                  compact
                  aria-label={t("filterProject")}
                  onChange={setProjectFilter}
                  options={[
                    { value: "", label: t("filterAllProjects") },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  value={projectFilter}
                />
              </Container>
              <Container width="19rem">
                <Dropdown<FeedStatus>
                  compact
                  multi
                  showSelectAll
                  aria-label={t("title")}
                  deselectAllLabel={t("filterClearAll")}
                  onChange={setFilter}
                  options={STATUSES.map((s) => ({
                    value: s,
                    label: `${t(`state.${s}`)} · ${count(s)}`,
                  }))}
                  placeholder={t("filterAll")}
                  removeLabel={t("filterRemove")}
                  selectAllLabel={t("filterSelectAll")}
                  value={filter}
                />
              </Container>
            </Stack>
          }
          subtitle={t("summary", { running, awaiting, total: scoped.length })}
          title={t("title")}
        />

        {runs.length === 0 ? (
          <EmptyState description={t("emptyDesc")} glyph="pulse" title={t("emptyTitle")} />
        ) : (
          <Grid align="start" gap="300" sidebar="left">
            <Stack gap="100">
              {list.length > 0 ? (
                list.map((r) => (
                  <TaskCard
                    glyph={runGlyph(r, glyphById)}
                    key={r.runId}
                    now={now}
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
function relative(iso: string, now: number, ago: (n: number, unit: string) => string): string {
  const min = Math.floor(Math.max(0, now - Date.parse(iso)) / 60000);
  if (min < 1) return ago(0, "m");
  if (min < 60) return ago(min, "m");
  return ago(Math.floor(min / 60), "h");
}
