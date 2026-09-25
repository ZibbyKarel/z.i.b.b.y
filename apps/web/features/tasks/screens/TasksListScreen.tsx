"use client";

import { DEPARTMENTS } from "@zibby/contracts";
import type { DepartmentId, TaskParent, TaskParentState, TaskSource } from "@zibby/contracts";
import {
  Button,
  ChainRouteStrip,
  type ChainRouteStripStep,
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  SelectField,
  Stack,
  StatePill,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { compactAgo } from "../../../utils/time";
import { useCompaniesQuery } from "../../companies";
import { useProjectsQuery } from "../../projects";
import { useTaskParentsInfiniteQuery } from "../queries";

const TASK_STATES: readonly TaskParentState[] = ["thinking", "working", "blocked", "error", "done"];
const TASK_SOURCES: readonly TaskSource[] = [
  "operator",
  "department",
  "chain",
  "channel",
  "automation",
  "handoff",
];

const ALL = "";

function subtaskRouteSteps(parent: TaskParent): ChainRouteStripStep[] {
  return parent.subtasks.map((s, i) => ({
    code: (s.department ?? "?").toUpperCase(),
    name: s.department ?? `SUB ${i + 1}`,
    state: s.state,
  }));
}

/**
 * `/work/tasks` — ZB-04b: the parent-task list (`GET /api/tasks/parents`), the
 * task-centric replacement for the old run-centric `/archiv` list (that stays as
 * `/activity/runs`, ZB-07). A `FilterBar` (company → project cascade, department,
 * state, source) over a cursor-paginated `DataTable`.
 */
export function TasksListScreen() {
  const t = useTranslations("tasksWork");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [now] = useState(() => Date.now());

  // `?company=<id>` (e.g. from the Companies detail's "All tasks" link) seeds the
  // initial filter — read once via the lazy initializer, then behaves as normal
  // local filter state (it does not resync if the URL changes underfoot).
  const [company, setCompany] = useState<string>(() => searchParams.get("company") ?? ALL);
  const [project, setProject] = useState<string>(ALL);
  const [department, setDepartment] = useState<string>(ALL);
  const [state, setState] = useState<string>(ALL);
  const [source, setSource] = useState<string>(ALL);

  const { data: companies = [] } = useCompaniesQuery();
  const { data: projects = [] } = useProjectsQuery();
  const projectOptions = useMemo(
    () => (company ? projects.filter((p) => p.companyId === company) : projects),
    [projects, company],
  );

  const {
    data: parents = [],
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTaskParentsInfiniteQuery({
    company: company || undefined,
    project: project || undefined,
    department: (department || undefined) as DepartmentId | undefined,
    state: (state || undefined) as TaskParentState | undefined,
    source: (source || undefined) as TaskSource | undefined,
  });

  const hasFilters = Boolean(company || project || department || state || source);
  const clearFilters = () => {
    setCompany(ALL);
    setProject(ALL);
    setDepartment(ALL);
    setState(ALL);
    setSource(ALL);
  };

  const columns: DataTableColumn<TaskParent>[] = [
    {
      key: "id",
      label: t("list.column.id"),
      width: "sm",
      render: (row) => `TSK-${row.id.slice(-4).toUpperCase()}`,
    },
    {
      key: "title",
      label: t("list.column.task"),
      width: "flex",
      render: (row) => (
        <Stack gap="25">
          <Typography type="note">{row.title || row.text.slice(0, 80)}</Typography>
          {row.projectId && (
            <Typography mono size="2xs" type="note" variant="tertiary">
              {row.projectId}
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      key: "route",
      label: t("list.column.route"),
      width: "lg",
      render: (row) =>
        row.subtasks.length > 0 ? (
          <ChainRouteStrip size="chip" steps={subtaskRouteSteps(row)} />
        ) : (
          <Typography size="sm" type="note" variant="tertiary">
            —
          </Typography>
        ),
    },
    {
      key: "state",
      label: t("list.column.state"),
      width: "sm",
      render: (row) => <StatePill label={t(`state.${row.state}`)} state={row.state} />,
    },
    {
      key: "source",
      label: t("list.column.source"),
      width: "sm",
      render: (row) =>
        row.source ? (
          <Typography mono size="2xs" tracking="wider" type="note" variant="secondary">
            {t(`source.${row.source}`)}
          </Typography>
        ) : (
          "—"
        ),
    },
    {
      key: "age",
      label: t("list.column.age"),
      width: "xs",
      align: "right",
      render: (row) => (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {compactAgo(row.createdAt, now)}
        </Typography>
      ),
    },
  ];

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("eyebrow")}
          </Typography>
          <Typography type="h1">{t("list.title")}</Typography>
        </Stack>

        <FilterBar onClear={hasFilters ? clearFilters : undefined}>
          <SelectField
            label={t("filter.company")}
            onValueChange={(v) => {
              setCompany(v);
              setProject(ALL);
            }}
            options={[
              { value: ALL, label: t("filter.all") },
              ...companies.map((c) => ({ value: c.id, label: c.name })),
            ]}
            value={company}
          />
          <SelectField
            label={t("filter.project")}
            onValueChange={setProject}
            options={[
              { value: ALL, label: t("filter.all") },
              ...projectOptions.map((p) => ({ value: p.id, label: p.name })),
            ]}
            value={project}
          />
          <SelectField
            label={t("filter.department")}
            onValueChange={setDepartment}
            options={[
              { value: ALL, label: t("filter.all") },
              ...DEPARTMENTS.map((d) => ({ value: d.id, label: d.name })),
            ]}
            value={department}
          />
          <SelectField
            label={t("filter.state")}
            onValueChange={setState}
            options={[
              { value: ALL, label: t("filter.all") },
              ...TASK_STATES.map((s) => ({ value: s, label: t(`state.${s}`) })),
            ]}
            value={state}
          />
          <SelectField
            label={t("filter.source")}
            onValueChange={setSource}
            options={[
              { value: ALL, label: t("filter.all") },
              ...TASK_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) })),
            ]}
            value={source}
          />
        </FilterBar>

        {isPending ? (
          <QueryLoading />
        ) : isError ? (
          <QueryError onRetry={() => void refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              empty={<EmptyState body={t("list.emptyBody")} title={t("list.emptyTitle")} />}
              getRowKey={(row) => row.id}
              onRowClick={(row) => router.push(`/work/tasks/${row.id}` as Route)}
              rows={parents}
            />
            {hasNextPage && (
              <Button
                disabled={isFetchingNextPage}
                intent="ghost"
                onClick={() => void fetchNextPage()}
                size="sm"
              >
                {isFetchingNextPage ? t("list.loadingMore") : t("list.loadMore")}
              </Button>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
