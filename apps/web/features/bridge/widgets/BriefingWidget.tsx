"use client";

import { BoardText, type Kpi, KpiStrip } from "@zibby/design-system";
import { type SubNavLinkComponent } from "@zibby/design-system";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { useApprovalsQuery } from "../../approvals/queries";
import { useBriefingQuery } from "../../briefing/queries";
import { useInboxPrsQuery } from "../../inbox/queries";
import { useBudgetQuery } from "../../projects/queries";
import { passesFilters } from "../../inbox/inbox";
import { useLiveRuns } from "../../runs/components/TasksDockPanel";
import { runsListHref } from "../../archive/runsListFilters";
import { formatUsd, spendMonthUsd } from "../state/rows";
import { useBridgeInboxFilters } from "../state/useBridgeInboxFilters";
import type { BridgeWidgetProps } from "./registry";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The pull-request table the OPEN PRS number opens (todo-18). */
export const PRS_PAGE_HREF = "/activity/pull-requests";

/**
 * Briefing: the current briefing's headline as the lead paragraph (with a mono date kicker)
 * and the KPI strip — NEEDS YOU (pending approvals), RUNNING NOW (running runs), OPEN PRS (the
 * PR widget's set), SPEND THIS MONTH (sum of the projects' month-to-date cost). Every number
 * links to its detail page (todo-18): the approvals queue, the runs table filtered to
 * running, the PR table, the budgets. Never empty; ERRORS and INCIDENTS from the reference
 * are not shown (no data source yet).
 */
export function BriefingWidget({ onEmptyChange, onCountChange }: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.briefing");
  const locale = useLocale();
  const filters = useBridgeInboxFilters();
  const { data: briefing } = useBriefingQuery();
  const { data: approvals } = useApprovalsQuery();
  const { data: prs } = useInboxPrsQuery();
  const { data: budget } = useBudgetQuery();
  // Only `running` — the bucket its `?state=running` link filters to, so the numbers match.
  const running = useLiveRuns().filter((r) => r.status === "running").length;
  const now = useNow(60_000);

  // Never empty (the KPIs always render); no count / YOU / aside in the header.
  useEffect(() => {
    onEmptyChange(false);
    onCountChange?.({});
  }, [onEmptyChange, onCountChange]);

  const kpis = useMemo<Kpi[]>(
    () => [
      {
        id: "needs",
        label: t("needs"),
        value: pad2(approvals?.length ?? 0),
        tone: "blocked",
        href: "/activity/approvals",
      },
      {
        id: "running",
        label: t("running"),
        value: pad2(running),
        tone: "working",
        href: runsListHref({ state: "running" }),
      },
      {
        id: "prs",
        label: t("prs"),
        value: pad2((prs?.prs ?? []).filter((p) => passesFilters(filters, p)).length),
        tone: "thinking",
        href: PRS_PAGE_HREF,
      },
      {
        id: "spend",
        label: t("spend"),
        value: formatUsd(spendMonthUsd(budget)),
        tone: "idle",
        href: "/governance/budgets",
      },
    ],
    [t, approvals, running, prs, filters, budget],
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
      linkComponent={Link as SubNavLinkComponent}
    />
  );
}
