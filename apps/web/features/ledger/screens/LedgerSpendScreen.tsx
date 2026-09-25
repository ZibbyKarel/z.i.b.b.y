"use client";

import { useTranslations } from "next-intl";
import { DEPARTMENTS, type DepartmentId, type GlobalBudget } from "@zibby/contracts";
import {
  BudgetMeter,
  Container,
  DataTable,
  type DataTableColumn,
  Grid,
  Progress,
  Slider,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useBudgetConfigQuery, useUpdateBudgetConfigMutation } from "../../budget";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { formatResetIn } from "../../../components/layout/LimitsRings/formatResetIn";
import { useLimitsQuery } from "../../limits";
import { useRunsQuery } from "../../runs/queries/useRunsQuery";
import { departmentSpendToday, totalSpendToday } from "../departmentSpend";

export enum LedgerSpendScreenTestId {
  Root = "ledger-spend-screen-root",
  MeterGrid = "ledger-spend-meter-grid",
  ThresholdSliders = "ledger-spend-threshold-sliders",
  DepartmentTable = "ledger-spend-department-table",
}

type Axis = "rolling" | "weekly";

/** OK / WARNING / STOPPED state label key for one window, given the operator's
 *  own warn/pause thresholds (absent threshold ⇒ that state never triggers). */
function stateKey(usedPct: number, warnAt?: number, stopAt?: number): "ok" | "warn" | "stop" {
  if (stopAt != null && usedPct >= stopAt) return "stop";
  if (warnAt != null && usedPct >= warnAt) return "warn";
  return "ok";
}

export function LedgerSpendScreen() {
  const t = useTranslations("ledgerSpend");
  const limits = useLimitsQuery();
  const config = useBudgetConfigQuery();
  const updateConfig = useUpdateBudgetConfigMutation();
  const runs = useRunsQuery();

  const isPending = limits.isPending || config.isPending || runs.isPending;
  const isError = limits.isError || config.isError || runs.isError;

  const now = new Date();
  const spendToday = totalSpendToday(runs.runs, now);
  const deptSpend = departmentSpendToday(runs.runs, now);
  const maxDeptSpend = Math.max(0, ...DEPARTMENTS.map((d) => deptSpend.get(d.id)?.spendUsd ?? 0));

  /** Slider→mutation: replace the whole config with one field changed — the API
   *  has no per-field PATCH, `PUT /api/budget/config` always replaces it whole. */
  function setField(field: keyof GlobalBudget, value: number) {
    updateConfig.mutate({ body: { ...config.data, [field]: value } });
  }

  function meter(axis: Axis) {
    const window = limits.data?.[axis];
    const usedPct = window?.usedPct ?? 0;
    const warnAt = config.data?.[axis === "rolling" ? "warnAtRollingPct" : "warnAtWeeklyPct"];
    const stopAt = config.data?.[axis === "rolling" ? "pauseAtRollingPct" : "pauseAtWeeklyPct"];
    const key = stateKey(usedPct, warnAt, stopAt);
    const resetIn = window ? formatResetIn(window.resetsAt, now.getTime()) : null;
    return (
      <BudgetMeter
        caption={`${t(`state.${key}`)} · ${resetIn ? t("resetsIn", { time: resetIn }) : t("resetUnknown")}`}
        label={t(`meter.${axis}`)}
        max={100}
        stopAt={stopAt}
        value={usedPct}
        warnAt={warnAt}
      />
    );
  }

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
      width: "sm",
      render: (id) => (
        <Typography type="note">{DEPARTMENTS.find((d) => d.id === id)?.name ?? id}</Typography>
      ),
    },
    {
      key: "bar",
      label: t("column.spend"),
      width: "flex",
      render: (id) => (
        <Progress
          height="75"
          value={maxDeptSpend > 0 ? ((deptSpend.get(id)?.spendUsd ?? 0) / maxDeptSpend) * 100 : 0}
        />
      ),
    },
    {
      key: "value",
      label: t("column.value"),
      width: "sm",
      align: "right",
      render: (id) => (
        <Typography mono type="note">
          ${(deptSpend.get(id)?.spendUsd ?? 0).toFixed(2)}
        </Typography>
      ),
    },
  ];

  return (
    <Container data-testid={LedgerSpendScreenTestId.Root} padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="baseline" direction="row" gap="150">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("eyebrow")}
          </Typography>
          <Typography type="h1">{t("title", { amount: spendToday.toFixed(2) })}</Typography>
        </Stack>

        {isPending ? (
          <QueryLoading />
        ) : isError ? (
          <QueryError
            onRetry={() => {
              void limits.refetch();
              void config.refetch();
              void runs.refetch();
            }}
          />
        ) : (
          <>
            <Grid cols={1} data-testid={LedgerSpendScreenTestId.MeterGrid} gap="100" md={2}>
              {meter("rolling")}
              {meter("weekly")}
            </Grid>

            <Grid cols={1} gap="200" lg={2}>
              <Stack data-testid={LedgerSpendScreenTestId.DepartmentTable} gap="100">
                <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                  {t("sectionDepartments")}
                </Typography>
                <DataTable
                  columns={columns}
                  getRowKey={(id) => id}
                  rows={DEPARTMENTS.map((d) => d.id)}
                />
              </Stack>

              <Stack data-testid={LedgerSpendScreenTestId.ThresholdSliders} gap="200">
                <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                  {t("sectionThresholds")}
                </Typography>
                <Slider
                  caption={t("warnCaption")}
                  format={(v) => `${v}%`}
                  label={t("warnRolling")}
                  max={100}
                  min={0}
                  onChange={(v) => setField("warnAtRollingPct", v)}
                  value={config.data?.warnAtRollingPct ?? 0}
                />
                <Slider
                  caption={t("warnCaption")}
                  format={(v) => `${v}%`}
                  label={t("warnWeekly")}
                  max={100}
                  min={0}
                  onChange={(v) => setField("warnAtWeeklyPct", v)}
                  value={config.data?.warnAtWeeklyPct ?? 0}
                />
                <Slider
                  caption={t("stopCaption")}
                  format={(v) => `${v}%`}
                  label={t("stopRolling")}
                  max={100}
                  min={0}
                  onChange={(v) => setField("pauseAtRollingPct", v)}
                  value={config.data?.pauseAtRollingPct ?? 0}
                />
                <Slider
                  caption={t("stopCaption")}
                  format={(v) => `${v}%`}
                  label={t("stopWeekly")}
                  max={100}
                  min={0}
                  onChange={(v) => setField("pauseAtWeeklyPct", v)}
                  value={config.data?.pauseAtWeeklyPct ?? 0}
                />
              </Stack>
            </Grid>
          </>
        )}
      </Stack>
    </Container>
  );
}
