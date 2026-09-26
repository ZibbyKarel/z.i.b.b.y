"use client";

import { DEPARTMENTS } from "@zibby/contracts";
import {
  Button,
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  Icon,
  SearchInput,
  SegmentedControl,
  type SegmentedControlItem,
  SelectField,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { formatDuration } from "../../../utils/time";
import { useOwnerDepartmentMaps } from "../../departments/useOwnerDepartment";
import { RUN_STATUS_GROUPS, type RunStatusGroupKey } from "../../runs/statusGroups";
import { type RunView, runTitle } from "../../runs/run";
import {
  type ArchiveDepartmentFilterId,
  NO_DEPARTMENT,
  archiveDepartmentFilterId,
} from "../archiveGroups";
import { useArchiveCountsQuery, useArchiveRunsInfiniteQuery } from "../queries";

const SEARCH_DEBOUNCE_MS = 300;
const ALL_STATE = "all";

/** A run's department display name (not the pure `archiveGroups` module — this
 * needs `t()` + the `DEPARTMENTS` registry). */
function departmentName(
  id: ArchiveDepartmentFilterId,
  t: ReturnType<typeof useTranslations<"archive">>,
): string {
  if (id === NO_DEPARTMENT) return t("noDepartment");
  return DEPARTMENTS.find((d) => d.id === id)?.name ?? id;
}

/** Total wall-clock duration for a finished run, formatted mono — `""` when
 * the task never wrote back a finish time (nothing to show, not a guess). */
function durationLabel(run: RunView): string {
  if (!run.taskOutcomeFinishedAt) return "";
  return formatDuration(Date.parse(run.taskOutcomeFinishedAt) - Date.parse(run.startedAt));
}

/** Which `RUN_STATUS_GROUPS` bucket (if any) a run's status belongs to. */
function statusGroupKey(status: RunView["status"]): RunStatusGroupKey | undefined {
  return RUN_STATUS_GROUPS.find((g) => g.statuses.includes(status))?.key;
}

/**
 * `/activity/runs` (ZB-07) — every archived run (D9's `ARCHIVED_STATES`), the
 * ex-`/archiv` search + department filter promoted to a `DataTable` with a state
 * `SegmentedControl` and infinite scroll; row click opens `/activity/runs/[runId]`
 * (moved from this screen's own master/detail split).
 */
export function ActivityRunsScreen() {
  const t = useTranslations("archive");
  const tRuns = useTranslations("runs");
  const router = useRouter();
  const ownerMaps = useOwnerDepartmentMaps();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [department, setDepartment] = useState<ArchiveDepartmentFilterId | "">("");
  const [state, setState] = useState<RunStatusGroupKey | typeof ALL_STATE>(ALL_STATE);

  const departmentFilter = department ? [department] : [];
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
  const rows =
    state === ALL_STATE ? items : items.filter((r) => statusGroupKey(r.status) === state);

  const stateItems: SegmentedControlItem[] = [
    { value: ALL_STATE, label: t("filter.all") },
    ...RUN_STATUS_GROUPS.map((g) => ({ value: g.key, label: tRuns(`group.${g.key}`) })),
  ];

  const isPending = itemsPending || countsPending;
  const isError = itemsError || countsError;

  const columns: DataTableColumn<RunView>[] = [
    {
      key: "title",
      label: t("column.task"),
      width: "flex",
      render: (row) => (
        <Stack gap="25">
          <Typography truncate type="note">
            {runTitle(row)}
          </Typography>
          <Typography mono truncate size="2xs" type="note" variant="tertiary">
            {[departmentName(archiveDepartmentFilterId(row, ownerMaps), t), row.project]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        </Stack>
      ),
    },
    {
      key: "state",
      label: t("column.state"),
      width: "sm",
      render: (row) => (
        <Stack align="center" direction="row" gap="75">
          <Icon name="run" size="xs" />
          <Typography size="sm" type="note" variant="secondary">
            {(() => {
              const key = statusGroupKey(row.status);
              return key ? tRuns(`group.${key}`) : row.status;
            })()}
          </Typography>
        </Stack>
      ),
    },
    {
      key: "duration",
      label: t("column.duration"),
      width: "sm",
      align: "right",
      render: (row) => (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {durationLabel(row)}
        </Typography>
      ),
    },
  ];

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="center" direction="row" gap="150" justify="between">
          <Stack wrap align="baseline" direction="row" gap="150">
            <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
              {t("eyebrow")}
            </Typography>
            <Typography type="h1">{t("title")}</Typography>
          </Stack>
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

        <FilterBar onClear={department ? () => setDepartment("") : undefined}>
          <SelectField
            label={t("filter.department")}
            onValueChange={(v) => setDepartment(v as ArchiveDepartmentFilterId | "")}
            options={[
              { value: "", label: t("filter.all") },
              { value: NO_DEPARTMENT, label: t("noDepartment") },
              ...DEPARTMENTS.map((d) => ({ value: d.id, label: d.name })),
            ]}
            value={department}
          />
          <SegmentedControl
            ariaLabel={t("column.state")}
            items={stateItems}
            onChange={(v) => setState(v as RunStatusGroupKey | typeof ALL_STATE)}
            value={state}
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
              rows={rows}
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
