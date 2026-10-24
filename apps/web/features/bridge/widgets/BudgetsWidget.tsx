"use client";

import {
  BoardLine,
  BoardRow,
  BoardTag,
  BoardText,
  Progress,
  type ProgressBarTone,
  TextLink,
} from "@zibby/design-system";
import type { Route } from "next";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import {
  type BudgetAxis,
  type BudgetHealthRow,
  type BudgetStatus,
  buildBudgetRows,
} from "../../budget/budgetHealth";
import { useCompaniesQuery } from "../../companies/queries";
import { useBudgetQuery, useProjectsQuery } from "../../projects/queries";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export enum BudgetsWidgetTestId {
  Row = "budgets-widget-row",
  Name = "budgets-widget-name",
  Badge = "budgets-widget-badge",
  Usage = "budgets-widget-usage",
  Percent = "budgets-widget-percent",
  Held = "budgets-widget-held",
  Empty = "budgets-widget-empty",
}

const TONE: Record<BudgetStatus, ProgressBarTone> = {
  exhausted: "bad",
  near: "warn",
  ok: "ok",
};

const COST_AXES: ReadonlySet<BudgetAxis> = new Set(["dailyCost", "weeklyCost", "monthlyCost"]);

const rowHref = (row: BudgetHealthRow): Route => {
  switch (row.kind) {
    case "limit":
      return "/governance/budgets" as Route;
    case "company":
      return `/companies/${encodeURIComponent(row.id)}` as Route;
    case "project":
      return `/projects/${encodeURIComponent(row.id)}` as Route;
  }
};

/**
 * Budgets & limits: the account limits, company rollups and project budgets, worst first, with
 * what is running out highlighted. Rows link to the owning detail page. Collapses to the header
 * when nothing is set.
 */
export function BudgetsWidget({ onEmptyChange, onCountChange }: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.budgets");
  const budgetQuery = useBudgetQuery();
  const projectsQuery = useProjectsQuery();
  const companiesQuery = useCompaniesQuery();

  const loading = budgetQuery.isPending || projectsQuery.isPending || companiesQuery.isPending;
  const failed = budgetQuery.isError || projectsQuery.isError || companiesQuery.isError;

  const built = useMemo(
    () =>
      budgetQuery.data
        ? buildBudgetRows({
            budget: budgetQuery.data,
            projects: projectsQuery.data ?? [],
            companies: companiesQuery.data ?? [],
          })
        : undefined,
    [budgetQuery.data, projectsQuery.data, companiesQuery.data],
  );
  const rows = built?.rows ?? [];
  const exhausted = rows.filter((r) => r.status === "exhausted").length;
  const near = rows.filter((r) => r.status === "near").length;
  const aside =
    exhausted > 0
      ? t("asideExhausted", { n: exhausted })
      : built?.limitsUnknown
        ? t("asideUnknown")
        : undefined;

  useWidgetReport(
    {
      loading,
      count: loading || !built ? undefined : rows.length,
      you: exhausted + near,
      aside,
      failed,
    },
    { onEmptyChange, onCountChange },
  );

  if (failed)
    return (
      <QueryError
        onRetry={() => {
          void budgetQuery.refetch();
          void projectsQuery.refetch();
          void companiesQuery.refetch();
        }}
      />
    );
  if (loading || !built) return null;
  if (rows.length === 0) {
    return (
      <BoardRow tone="neutral">
        <span data-testid={BudgetsWidgetTestId.Empty}>
          <BoardText kind="meta" tone="ink3">
            {t("empty")}
          </BoardText>
        </span>
      </BoardRow>
    );
  }
  return (
    <>
      {rows.map((row) => (
        <BudgetRow key={`${row.kind}:${row.id}`} row={row} />
      ))}
    </>
  );
}

interface BudgetRowProps {
  row: BudgetHealthRow;
}

function BudgetRow({ row }: BudgetRowProps) {
  const t = useTranslations("bridge.widgets.budgets");
  const locale = useLocale();
  const money = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
  const amount = COST_AXES.has(row.axis) ? money : (n: number) => String(n);

  const name =
    row.kind === "limit" ? (row.id === "rolling" ? t("limit5h") : t("limitWeekly")) : row.name;
  const axisLabel = t(`axis.${row.axis}`);
  const usage =
    row.kind === "limit"
      ? axisLabel
      : row.cap > 0
        ? `${amount(row.used)}/${amount(row.cap)} ${axisLabel}`
        : `${amount(row.used)} ${axisLabel}`;
  // Floor, so the shown percent never crosses a threshold the badge hasn't (79.6 % ≠ "80 %").
  const pct = Math.floor(row.ratio * 100);

  return (
    <BoardRow
      tone={row.status === "exhausted" ? "error" : row.status === "near" ? "blocked" : "neutral"}
    >
      <TextLink data-testid={BudgetsWidgetTestId.Row} href={rowHref(row)} linkComponent={Link}>
        <BoardLine between gap="6" indent={false}>
          <span data-testid={BudgetsWidgetTestId.Name}>
            <BoardText kind="title">{name}</BoardText>
          </span>
          {row.status !== "ok" ? (
            <BoardTag
              data-testid={BudgetsWidgetTestId.Badge}
              variant={row.status === "exhausted" ? "you" : "source"}
            >
              {t(row.status)}
            </BoardTag>
          ) : null}
        </BoardLine>
        {row.cap > 0 ? <Progress label={name} tone={TONE[row.status]} value={pct} /> : null}
        <BoardLine between gap="6" indent={false}>
          <span data-testid={BudgetsWidgetTestId.Usage}>
            <BoardText kind="meta" tone="ink2">
              {usage}
            </BoardText>
          </span>
          {row.cap > 0 ? (
            <span data-testid={BudgetsWidgetTestId.Percent}>
              <BoardText kind="meta" tone="ink2">
                {`${pct} %`}
              </BoardText>
            </span>
          ) : null}
        </BoardLine>
        {row.held > 0 ? (
          <span data-testid={BudgetsWidgetTestId.Held}>
            <BoardText kind="meta" tone="ink3">
              {t("held", { n: row.held })}
            </BoardText>
          </span>
        ) : null}
      </TextLink>
    </BoardRow>
  );
}
