"use client";

import {
  Button,
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  SearchInput,
  SegmentedControl,
  type SegmentedControlItem,
  SelectField,
  Stack,
  StatePill,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ArchiveSort, RunKindSchema } from "@zibby/contracts";
import { useEffect, useRef, useState } from "react";
import { type DepartmentLookup } from "../../departments/departmentLookup";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { formatCostUsd } from "../../../utils/cost";
import { compactAgo, formatDuration } from "../../../utils/time";
import { useProjectsQuery } from "../../projects";
import { useOwnerDepartmentMaps } from "../../departments/useOwnerDepartment";
import { RUN_STATUS_GROUPS } from "../../runs/statusGroups";
import { type RunView, runTitle } from "../../runs/run";
import {
  type ArchiveDepartmentFilterId,
  NO_DEPARTMENT,
  archiveDepartmentFilterId,
} from "../archiveGroups";
import {
  type RunsListFilters,
  nextSort,
  parseRunsListFilters,
  statusesForState,
  writeRunsListFilters,
} from "../runsListFilters";
import { useArchiveCountsQuery, useArchiveRunsInfiniteQuery } from "../queries";

const SEARCH_DEBOUNCE_MS = 300;
const ALL_STATE = "all";

/** A run's department display name (not the pure `archiveGroups` module — this
 * needs `t()` + the departments registry). */
function departmentName(
  id: ArchiveDepartmentFilterId,
  t: ReturnType<typeof useTranslations<"archive">>,
  departments: DepartmentLookup,
): string {
  if (id === NO_DEPARTMENT) return t("noDepartment");
  return departments.name(id);
}

/** Total wall-clock duration for a finished run, formatted mono — `""` when
 * the task never wrote back a finish time (nothing to show, not a guess). */
function durationLabel(run: RunView): string {
  if (!run.taskOutcomeFinishedAt) return "";
  return formatDuration(Date.parse(run.taskOutcomeFinishedAt) - Date.parse(run.startedAt));
}

/** Which `RUN_STATUS_GROUPS` bucket (if any) a run's status belongs to. */
function statusGroup(status: RunView["status"]) {
  return RUN_STATUS_GROUPS.find((g) => g.statuses.includes(status));
}

/**
 * `/activity/runs` (ZB-07, todo-14) — every run, live and finished (todo-14 merged the
 * old `/work/tasks` list into it). Filters (search, state group, department, project,
 * kind) and the sort column all live in the URL (`runsListFilters`) and run server-side,
 * so the table survives a trip to a run detail and back and can be pinned. Infinite
 * scroll; row click opens `/activity/runs/[runId]`.
 */
export function ActivityRunsScreen() {
  const t = useTranslations("archive");
  const departments = useDepartmentLookup();
  const tRuns = useTranslations("runs");
  const router = useRouter();
  const ownerMaps = useOwnerDepartmentMaps();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [now] = useState(() => Date.now());
  const { data: projects = [] } = useProjectsQuery();

  const filters = parseRunsListFilters(searchParams);
  const setFilters = (patch: Partial<RunsListFilters>) => {
    const qs = writeRunsListFilters(searchParams, { ...filters, ...patch }).toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route);
  };

  // The search box types locally; the debounced value is what lands in `?q=`.
  const [query, setQuery] = useState(filters.q);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  // Write only when the debounced text itself changed, so an outside `?q=` change (a
  // pinned link, back/forward) is not overwritten by a stale debounce.
  const lastDebounced = useRef(debouncedQuery);
  useEffect(() => {
    if (debouncedQuery === lastDebounced.current) return;
    lastDebounced.current = debouncedQuery;
    const next = { ...parseRunsListFilters(searchParams), q: debouncedQuery };
    const qs = writeRunsListFilters(searchParams, next).toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route);
  }, [debouncedQuery, searchParams, pathname, router]);

  const statuses = statusesForState(filters.state);
  const {
    data: rows = [],
    isPending: itemsPending,
    isError: itemsError,
    refetch: refetchItems,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useArchiveRunsInfiniteQuery({
    search: filters.q,
    departments: filters.department ? [filters.department] : [],
    statuses,
    project: filters.project || undefined,
    kind: filters.kind || undefined,
    sort: filters.sort || undefined,
    dir: filters.dir || undefined,
  });
  const {
    data: archiveCounts,
    isPending: countsPending,
    isError: countsError,
    refetch: refetchCounts,
  } = useArchiveCountsQuery(filters.q, statuses);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
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
  const stateItems: SegmentedControlItem[] = [
    { value: ALL_STATE, label: t("filter.allStates") },
    ...RUN_STATUS_GROUPS.map((g) => ({ value: g.key, label: tRuns(`group.${g.key}`) })),
  ];
  const hasFilters = Boolean(
    filters.department || filters.project || filters.kind || filters.state,
  );

  const isPending = itemsPending || countsPending;
  const isError = itemsError || countsError;

  const columns: DataTableColumn<RunView>[] = [
    {
      key: "title",
      label: t("column.task"),
      width: "flex",
      sortable: true,
      render: (row) => (
        <Stack gap="25">
          <Typography truncate type="note">
            {runTitle(row)}
          </Typography>
          <Typography mono truncate size="2xs" type="note" variant="tertiary">
            {[
              departmentName(archiveDepartmentFilterId(row, ownerMaps), t, departments),
              row.project,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        </Stack>
      ),
    },
    {
      key: "processor",
      label: t("column.processor"),
      width: "lg",
      render: (row) => (
        <Stack gap="25">
          <Typography truncate type="note">
            {row.processor?.name ?? row.owner}
          </Typography>
          <Typography mono size="2xs" type="note" variant="tertiary">
            {tRuns(`kind.${row.kind}`)}
          </Typography>
        </Stack>
      ),
    },
    {
      key: "state",
      label: t("column.state"),
      width: "md",
      sortable: true,
      render: (row) => {
        const group = statusGroup(row.status);
        return (
          <StatePill
            label={group ? tRuns(`group.${group.key}`) : row.status}
            state={group?.state ?? "idle"}
          />
        );
      },
    },
    {
      key: "started",
      label: t("column.started"),
      width: "sm",
      align: "right",
      sortable: true,
      render: (row) => (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {compactAgo(row.startedAt, now)}
        </Typography>
      ),
    },
    {
      key: "duration",
      label: t("column.duration"),
      width: "sm",
      align: "right",
      sortable: true,
      render: (row) => (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {durationLabel(row)}
        </Typography>
      ),
    },
    {
      key: "cost",
      label: t("column.cost"),
      width: "sm",
      align: "right",
      sortable: true,
      render: (row) => (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {row.costUsd != null ? formatCostUsd(row.costUsd) : ""}
        </Typography>
      ),
    },
  ];

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="center" direction="row" gap="150" justify="between">
          <Typography type="h1">{t("title")}</Typography>
          <Container shrink={false} width="320px">
            <SearchInput
              ariaLabel={t("searchAriaLabel")}
              count={archivedTotal}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              value={query}
            />
          </Container>
        </Stack>

        <FilterBar
          onClear={
            hasFilters
              ? () => setFilters({ department: "", project: "", kind: "", state: "" })
              : undefined
          }
        >
          <SelectField
            label={t("filter.department")}
            onValueChange={(v) => setFilters({ department: v })}
            options={[
              { value: "", label: t("filter.all") },
              { value: NO_DEPARTMENT, label: t("noDepartment") },
              ...departments.list.map((d) => ({ value: d.id, label: d.name })),
            ]}
            value={filters.department}
          />
          <SelectField
            label={t("filter.project")}
            onValueChange={(v) => setFilters({ project: v })}
            options={[
              { value: "", label: t("filter.allProjects") },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            value={filters.project}
          />
          <SelectField
            label={t("filter.kind")}
            onValueChange={(v) => setFilters({ kind: v as RunsListFilters["kind"] })}
            options={[
              { value: "", label: t("filter.allKinds") },
              ...RunKindSchema.options.map((k) => ({ value: k, label: tRuns(`kind.${k}`) })),
            ]}
            value={filters.kind}
          />
          <SegmentedControl
            ariaLabel={t("column.state")}
            items={stateItems}
            onChange={(v) =>
              setFilters({ state: v === ALL_STATE ? "" : (v as RunsListFilters["state"]) })
            }
            value={filters.state || ALL_STATE}
          />
        </FilterBar>

        {isPending ? (
          <QueryLoading />
        ) : isError ? (
          <QueryError
            onRetry={() => {
              void refetchItems();
              void refetchCounts();
            }}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              empty={
                <EmptyState
                  body={archivedTotal === 0 ? t("emptyDescription") : t("emptyFilter")}
                  title={archivedTotal === 0 ? t("emptyTitle") : t("emptyFilter")}
                />
              }
              getRowKey={(row) => row.runId}
              onRowClick={(row) => router.push(`/activity/runs/${row.runId}` as Route)}
              onSortChange={(key) => setFilters(nextSort(filters, key as ArchiveSort))}
              rows={rows}
              sort={{ key: filters.sort || "started", dir: filters.dir || "desc" }}
            />
            {hasNextPage && (
              <Button
                disabled={isFetchingNextPage}
                intent="ghost"
                onClick={() => void fetchNextPage()}
                size="sm"
              >
                {isFetchingNextPage ? t("loadingMore") : t("loadMore")}
              </Button>
            )}
            <div ref={sentinelRef} />
          </>
        )}
      </Stack>
    </Container>
  );
}
