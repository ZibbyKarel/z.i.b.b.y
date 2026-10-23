"use client";

import { BoardText, type Kpi, KpiStrip } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { useApprovalsQuery } from "../../approvals/queries";
import { useBriefingQuery } from "../../briefing/queries";
import { useInboxPrsQuery } from "../../inbox/queries";
import { useBudgetQuery } from "../../projects/queries";
import { passesFilters } from "../../inbox/inbox";
import { useLiveRuns } from "../../runs/components/TasksDockPanel";
import { formatUsd, spendTodayUsd } from "../state/rows";
import { useBridgeInboxFilters } from "../state/useBridgeInboxFilters";
import type { BridgeWidgetProps } from "./registry";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Briefing: the current briefing's headline as the lead paragraph (with a mono date kicker)
 * and the KPI strip — NEEDS YOU (pending approvals), RUNNING NOW (live runs), OPEN PRS (the
 * PR widget's set), SPEND TODAY (sum of the projects' daily cost). Never empty; ERRORS and
 * INCIDENTS from the reference are not shown (no data source yet).
 */
export function BriefingWidget({ onEmptyChange, onCountChange }: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.briefing");
  const locale = useLocale();
  const filters = useBridgeInboxFilters();
  const { data: briefing } = useBriefingQuery();
  const { data: approvals } = useApprovalsQuery();
  const { data: prs } = useInboxPrsQuery();
  const { data: budget } = useBudgetQuery();
  const live = useLiveRuns();
  const now = useNow(60_000);

  // Never empty (the KPIs always render); no count / YOU / aside in the header.
  useEffect(() => {
    onEmptyChange(false);
    onCountChange?.({});
  }, [onEmptyChange, onCountChange]);

  const kpis = useMemo<Kpi[]>(
    () => [
      { id: "needs", label: t("needs"), value: pad2(approvals?.length ?? 0), tone: "blocked" },
      { id: "running", label: t("running"), value: pad2(live.length), tone: "working" },
      {
        id: "prs",
        label: t("prs"),
        value: pad2((prs?.prs ?? []).filter((p) => passesFilters(filters, p)).length),
        tone: "thinking",
      },
      { id: "spend", label: t("spend"), value: formatUsd(spendTodayUsd(budget)), tone: "idle" },
    ],
    [t, approvals, live.length, prs, filters, budget],
  );

  const date = new Date(briefing?.generatedAt ?? now).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <KpiStrip
      kpis={kpis}
      lead={
        <>
          <BoardText kind="kicker">{t("kicker", { date })}</BoardText>
          <BoardText kind="lead">{briefing?.headline || t("fallback")}</BoardText>
        </>
      }
    />
  );
}
