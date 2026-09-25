"use client";

import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DEPARTMENTS, type DepartmentId, type ProjectBudgetStatus } from "@zibby/contracts";
import {
  BudgetMeter,
  Container,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Grid,
  Stack,
  Typography,
} from "@zibby/design-system";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useCompaniesQuery } from "../../companies/queries";
import { useProjectsQuery } from "../../projects/queries";
import { useBudgetQuery } from "../../projects/queries/useBudgetQuery";
import { useRunsQuery } from "../../runs/queries/useRunsQuery";
import { departmentSpendToday } from "../departmentSpend";

export enum LedgerBudgetsScreenTestId {
  Root = "ledger-budgets-screen-root",
  GlobalGrid = "ledger-budgets-global-grid",
  CompanyGrid = "ledger-budgets-company-grid",
  ProjectGrid = "ledger-budgets-project-grid",
  DepartmentTable = "ledger-budgets-department-table",
}

interface WindowUsage {
  used: number;
  cap?: number;
}

/** Sum a set of same-shaped run-count windows. `cap` sums only the DEFINED caps —
 *  a project/company with no cap on that axis contributes 0 usage and 0 cap, so it
 *  never distorts the aggregate's denominator (an uncapped member just doesn't
 *  count toward either side of the ratio). */
function sumUsage(rows: readonly WindowUsage[]): WindowUsage {
  let used = 0;
  let cap: number | undefined;
  for (const row of rows) {
    used += row.used;
    if (row.cap != null) cap = (cap ?? 0) + row.cap;
  }
  return { used, cap };
}

/** `12/50` or `—` when this axis has no cap set at all. */
function ratio(usage: WindowUsage): string {
  return usage.cap != null ? `${usage.used}/${usage.cap}` : "—";
}

interface Row {
  daily: WindowUsage;
  weekly: WindowUsage;
  monthly: WindowUsage;
}

interface ProjectRow extends Row {
  projectId: string;
  name: string;
}

/** `ProjectBudgetStatus.monthly` is optional (back-compat, M7) — default it to
 *  zero usage/no cap so every row shape going into `rollup`/`ratio` is whole. */
function toProjectRow(p: ProjectBudgetStatus): ProjectRow {
  return {
    projectId: p.projectId,
    name: p.name,
    daily: p.daily,
    weekly: p.weekly,
    monthly: p.monthly ?? { used: 0 },
  };
}

function rollup(rows: readonly Row[]): Row {
  return {
    daily: sumUsage(rows.map((r) => r.daily)),
    weekly: sumUsage(rows.map((r) => r.weekly)),
    monthly: sumUsage(rows.map((r) => r.monthly)),
  };
}

/** One entity's meter card — the daily window is the primary bar (BudgetMeter),
 *  weekly/monthly ride the caption. The whole card is a link to the entity's own
 *  detail page (a card-click navigates to a detail page), where its real budget
 *  fields are edited — the Ledger reads, it doesn't reimplement that form. */
function EntityBudgetCard({
  name,
  href,
  row,
  t,
}: {
  name: string;
  href: Route;
  row: Row;
  t: ReturnType<typeof useTranslations<"ledgerBudgets">>;
}) {
  return (
    <Link aria-label={t("openAria", { name })} href={href}>
      <BudgetMeter
        caption={t("otherWindowsCaption", {
          week: ratio(row.weekly),
          month: ratio(row.monthly),
        })}
        label={name}
        max={row.daily.cap ?? 0}
        value={row.daily.used}
      />
    </Link>
  );
}

/**
 * ZB-10 / `/ledger/budgets` — global + per-company + per-project run-cap
 * `BudgetMeter`s (from the existing `GET /api/budget` readout) plus the
 * department table (runs/spend today, rolled up client-side from the unified
 * run feed — O-06; the caps column is "—", per-department caps aren't built).
 * Editing a company/project's own cap happens on ITS detail page (existing
 * forms) — a card here just links there.
 */
export function LedgerBudgetsScreen() {
  const t = useTranslations("ledgerBudgets");
  const budget = useBudgetQuery();
  const companies = useCompaniesQuery();
  const projects = useProjectsQuery();
  const runs = useRunsQuery();

  const isPending = budget.isPending || companies.isPending || projects.isPending || runs.isPending;
  const isError = budget.isError || companies.isError || projects.isError || runs.isError;

  const projectRows = (budget.data?.projects ?? []).map(toProjectRow);
  const companyList = companies.data ?? [];
  const projectList = projects.data ?? [];

  const companyIdByProject = new Map(projectList.map((p) => [p.id, p.companyId ?? undefined]));

  const global = rollup(projectRows);

  const companyRows = companyList
    .map((c) => {
      const members = projectRows.filter((p) => companyIdByProject.get(p.projectId) === c.id);
      return members.length > 0 ? { id: c.id, name: c.name, row: rollup(members) } : null;
    })
    .filter((c): c is { id: string; name: string; row: Row } => c !== null);

  const deptSpend = departmentSpendToday(runs.runs);

  const columns: DataTableColumn<DepartmentId>[] = [
    {
      key: "code",
      label: t("column.code"),
      width: "xs",
      render: (id) => (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {DEPARTMENTS.find((d) => d.id === id)?.code ?? id}
        </Typography>
      ),
    },
    {
      key: "name",
      label: t("column.department"),
      width: "flex",
      render: (id) => (
        <Typography type="note">{DEPARTMENTS.find((d) => d.id === id)?.name ?? id}</Typography>
      ),
    },
    {
      key: "runsToday",
      label: t("column.runsToday"),
      width: "sm",
      align: "right",
      render: (id) => (
        <Typography mono type="note">
          {deptSpend.get(id)?.runs ?? 0}
        </Typography>
      ),
    },
    {
      key: "spendToday",
      label: t("column.spendToday"),
      width: "sm",
      align: "right",
      render: (id) => (
        <Typography mono type="note">
          ${(deptSpend.get(id)?.spendUsd ?? 0).toFixed(2)}
        </Typography>
      ),
    },
    {
      key: "dailyCap",
      label: t("column.dailyCap"),
      width: "sm",
      align: "right",
      render: () => (
        <Typography mono type="note" variant="tertiary">
          —
        </Typography>
      ),
    },
  ];

  return (
    <Container data-testid={LedgerBudgetsScreenTestId.Root} padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("eyebrow")}
          </Typography>
          <Typography type="h1">{t("title")}</Typography>
          <Typography type="note" variant="secondary">
            {t("subtitle")}
          </Typography>
        </Stack>

        {isPending ? (
          <QueryLoading />
        ) : isError ? (
          <QueryError
            onRetry={() => {
              void budget.refetch();
              void companies.refetch();
              void projects.refetch();
              void runs.refetch();
            }}
          />
        ) : (
          <>
            <Grid cols={1} data-testid={LedgerBudgetsScreenTestId.GlobalGrid} gap="100" md={3}>
              <BudgetMeter
                caption={t("meta.day")}
                label={t("cap.day")}
                max={global.daily.cap ?? 0}
                value={global.daily.used}
              />
              <BudgetMeter
                caption={t("meta.week")}
                label={t("cap.week")}
                max={global.weekly.cap ?? 0}
                value={global.weekly.used}
              />
              <BudgetMeter
                caption={t("meta.month")}
                label={t("cap.month")}
                max={global.monthly.cap ?? 0}
                value={global.monthly.used}
              />
            </Grid>

            <Stack gap="100">
              <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                {t("sectionCompanies")}
              </Typography>
              {companyRows.length === 0 ? (
                <EmptyState body={t("emptyCompanies")} title={t("emptyCompaniesTitle")} />
              ) : (
                <Grid cols={1} data-testid={LedgerBudgetsScreenTestId.CompanyGrid} gap="100" md={3}>
                  {companyRows.map((c) => (
                    <EntityBudgetCard
                      href={`/companies/${c.id}` as Route}
                      key={c.id}
                      name={c.name}
                      row={c.row}
                      t={t}
                    />
                  ))}
                </Grid>
              )}
            </Stack>

            <Stack gap="100">
              <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                {t("sectionProjects")}
              </Typography>
              {projectRows.length === 0 ? (
                <EmptyState body={t("emptyProjects")} title={t("emptyProjectsTitle")} />
              ) : (
                <Grid cols={1} data-testid={LedgerBudgetsScreenTestId.ProjectGrid} gap="100" md={3}>
                  {projectRows.map((p) => (
                    <EntityBudgetCard
                      href={`/projects/${p.projectId}` as Route}
                      key={p.projectId}
                      name={p.name}
                      row={p}
                      t={t}
                    />
                  ))}
                </Grid>
              )}
            </Stack>

            <Stack data-testid={LedgerBudgetsScreenTestId.DepartmentTable} gap="100">
              <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                {t("sectionDepartments")}
              </Typography>
              <DataTable
                columns={columns}
                getRowKey={(id) => id}
                rows={DEPARTMENTS.map((d) => d.id)}
              />
            </Stack>
          </>
        )}
      </Stack>
    </Container>
  );
}
