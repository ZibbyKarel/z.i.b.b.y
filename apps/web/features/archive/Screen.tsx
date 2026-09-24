"use client";

import { DEPARTMENTS } from "@zibby/contracts";
import { Container, SearchInput, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { ImmersivePage } from "../../components/layout/ImmersivePage/ImmersivePage";
import { formatDuration } from "../../utils/time";
import { RunDetail } from "../runs/components/RunDetail";
import { useTaskRunQuery } from "../runs/queries/useTaskRunQuery";
import { useRunAvatarMap, useRunGlyphMap } from "../runs/queries/useRunsQuery";
import { type RunView, findSelectedRun, runAvatar, runGlyph } from "../runs/run";
import { useRunActions } from "../runs/useRunActions";
import { useOwnerDepartmentMaps } from "../departments/useOwnerDepartment";
import {
  type ArchiveDepartmentFilterId,
  NO_DEPARTMENT,
  archiveDepartmentFilterId,
} from "./archiveGroups";
import { ArchiveRow } from "./components/ArchiveRow";
import { ArchiveDepartmentFilter } from "./components/ArchiveDepartmentFilter";
import { useArchiveCountsQuery, useArchiveRunsInfiniteQuery } from "./queries";

const SEARCH_DEBOUNCE_MS = 300;

/** A run's display name + dot colour — resolved here (not in the pure
 * `archiveGroups` module) since it needs both `t()` and the `DEPARTMENTS`
 * registry. Shown in every row's subline (`{department} · {project}`). */
function departmentDisplay(
  id: ArchiveDepartmentFilterId,
  t: ReturnType<typeof useTranslations<"archive">>,
): { name: string; color?: string } {
  if (id === NO_DEPARTMENT) return { name: t("noDepartment") };
  const s = DEPARTMENTS.find((x) => x.id === id);
  return { name: s?.name ?? id, color: s?.color };
}

/** Total wall-clock duration for a finished run, formatted mono — `""` when
 * the task never wrote back a finish time (nothing to show, not a guess). */
function durationLabel(run: RunView): string {
  if (!run.taskOutcomeFinishedAt) return "";
  return formatDuration(Date.parse(run.taskOutcomeFinishedAt) - Date.parse(run.startedAt));
}

/**
 * `/archiv` — the task archive (F2, `docs/plans/hud2chat-F2-archive.md`): every
 * finished task (D9's `ARCHIVED_STATES`) across every department, in one
 * design-literal master/detail page (`design/Z.I.B.B.Y/ZIBBY Archiv úloh.html`).
 *
 * A flat list, newest → oldest, lazy-loaded as the operator scrolls
 * (`useArchiveRunsInfiniteQuery`) — search and the department filter both run
 * server-side (`TaskRunsService.listArchivedTaskRuns`/`getArchiveCounts`), so they
 * reach every archived run, not just whatever page has already loaded.
 *
 * D12: `ImmersiveShell`'s body has no padding, and this page deliberately keeps it
 * that way — a master/detail split should touch the viewport edges — so padding is
 * supplied per-pane below instead of on the page root.
 */
export function Screen() {
  const t = useTranslations("archive");
  const glyphById = useRunGlyphMap();
  const avatarById = useRunAvatarMap();
  const ownerMaps = useOwnerDepartmentMaps();
  const [now] = useState(() => Date.now());

  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [departmentFilter, setDepartmentFilter] = useState<ArchiveDepartmentFilterId[]>([]);
  const [selId, setSelId] = useState<string | null>(searchParams.get("run"));

  const {
    data: items = [],
    isPending: itemsPending,
    isError: itemsError,
    refetch: refetchItems,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useArchiveRunsInfiniteQuery({ search: debouncedQuery, departments: departmentFilter });
  const {
    data: archiveCounts,
    isPending: countsPending,
    isError: countsError,
    refetch: refetchCounts,
  } = useArchiveCountsQuery(debouncedQuery);

  const { stop, stopping, resume, resuming, remove, deleting } = useRunActions(
    (runId) => setSelId(runId),
    () => setSelId(null),
  );

  const securityRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = securityRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const archivedTotal = archiveCounts?.total ?? 0;
  const counts = (archiveCounts?.counts ?? {}) as Partial<
    Record<ArchiveDepartmentFilterId, number>
  >;
  // This feed only holds SETTLED runs, but `?run=` links arrive from places that
  // don't know that — the roadmap item dialog's "open run" points at an issue's
  // run while it is usually still in flight. `findSelectedRun` falls back to
  // `list[0]` on a miss, so detect the miss explicitly and resolve that id
  // directly instead of confidently showing the wrong (newest) run.
  const listed = findSelectedRun(items, selId);
  const listedMatchesSel = selId == null || listed?.runId === selId || listed?.taskId === selId;
  const directRun = useTaskRunQuery(listedMatchesSel ? null : selId);
  const selected = listedMatchesSel ? listed : (directRun.data ?? null);

  const isPending = itemsPending || countsPending;
  const isError = itemsError || countsError;

  if (isPending) {
    return (
      <ImmersivePage subtitle={t("subtitle")} title={t("title")}>
        <QueryLoading />
      </ImmersivePage>
    );
  }

  if (isError) {
    return (
      <ImmersivePage subtitle={t("subtitle")} title={t("title")}>
        <QueryError
          onRetry={() => {
            void refetchItems();
            void refetchCounts();
          }}
        />
      </ImmersivePage>
    );
  }

  return (
    <ImmersivePage
      actions={
        <Container shrink={false} width="380px">
          <SearchInput
            ariaLabel={t("searchAriaLabel")}
            count={archivedTotal}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            value={query}
          />
        </Container>
      }
      subtitle={t("subtitle")}
      title={t("title")}
    >
      <Stack direction="row" style={{ height: "100%" }}>
        <Container
          height="100%"
          overflowY="auto"
          shrink={false}
          style={{ borderRight: "1px solid var(--color-border)" }}
          width="340px"
        >
          <Container padding="150" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <ArchiveDepartmentFilter
              counts={counts}
              onChange={setDepartmentFilter}
              selected={departmentFilter}
              total={archivedTotal}
            />
          </Container>

          <Container padding="150">
            {archivedTotal === 0 ? (
              <Stack gap="75">
                <Typography size="xs" type="note" variant="tertiary">
                  {t("emptyTitle")}
                </Typography>
                <Typography size="2xs" type="note" variant="tertiary">
                  {t("emptyDescription")}
                </Typography>
              </Stack>
            ) : items.length === 0 ? (
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("emptyFilter")}
              </Typography>
            ) : (
              <Stack gap="50">
                {items.map((run) => {
                  const departmentId = archiveDepartmentFilterId(run, ownerMaps);
                  const display = departmentDisplay(departmentId, t);
                  return (
                    <ArchiveRow
                      active={selected?.runId === run.runId}
                      departmentColor={display.color}
                      departmentName={display.name}
                      durationLabel={durationLabel(run)}
                      key={run.runId}
                      onSelect={setSelId}
                      run={run}
                    />
                  );
                })}
                <div ref={securityRef} />
              </Stack>
            )}
          </Container>
        </Container>

        <Container grow height="100%" overflowY="auto">
          {selected ? (
            <Container data-testid="archive-detail-pane" padding="300">
              <RunDetail
                avatar={runAvatar(selected, avatarById)}
                deleting={deleting}
                glyph={runGlyph(selected, glyphById)}
                key={selected.runId}
                now={now}
                onDelete={() => remove(selected.runId, selected.kind)}
                onResume={() => resume(selected)}
                onStop={() => stop(selected)}
                resuming={resuming}
                run={selected}
                stopping={stopping}
              />
            </Container>
          ) : (
            <HudPanel padding="500">
              <Container textAlign="center">
                <Typography mono size="sm" type="note" variant="secondary">
                  {t("selectHint")}
                </Typography>
              </Container>
            </HudPanel>
          )}
        </Container>
      </Stack>
    </ImmersivePage>
  );
}
