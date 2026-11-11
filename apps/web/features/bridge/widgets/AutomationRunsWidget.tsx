"use client";

import { BoardLine, BoardRow, BoardText, RowGroupHeader } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useNow } from "../../../hooks/useNow";
import { useAutomationsQuery } from "../../automations/queries";
import { SCHEDULE_TIME_ZONE, nextCronRun, relativeLabel } from "../../automations/schedule";
import { useCronLabel } from "../../automations/useCronLabel";
import { useLiveRuns } from "../../runs/components/TasksDockPanel";
import { runRows } from "../state/rows";
import type { BridgeWidgetProps } from "./registry";
import { RunElapsed, RunTitle } from "./RunsWidget";
import { useWidgetReport } from "./useWidgetReport";

export enum AutomationRunsWidgetTestId {
  /** The row's 24h time cell — suffixed `-<row key>`. */
  Time = "automation-runs-widget-time",
}

const HORIZON_MS = 24 * 60 * 60 * 1000;

/**
 * Automation runs: the live runs an automation fired (same row design as the Runs widget), then
 * each enabled cron automation's next fire within the next 24 h, soonest first. Times are 24h
 * (Europe/Prague, the scheduler's zone). Every row opens the automation sheet (detail + run now).
 */
export function AutomationRunsWidget({
  widget,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
  sheetSide,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.automationRuns");
  const locale = useLocale();
  const cronLabel = useCronLabel();
  const now = useNow(60_000);
  const live = useLiveRuns();
  const { data: automations, isPending } = useAutomationsQuery();
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const hhmm = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: SCHEDULE_TIME_ZONE,
      }),
    [locale],
  );
  const nameOf = useMemo(
    () => new Map((automations ?? []).map((a) => [a.id, a.name ?? a.id])),
    [automations],
  );

  const running = useMemo(() => {
    const runs = live.filter((r) => r.automationId);
    return runRows(widget.id, runs).map((row, i) => ({
      ...row,
      automationId: runs[i]?.automationId ?? "",
    }));
  }, [widget.id, live]);

  const upcoming = useMemo(
    () =>
      (automations ?? [])
        .flatMap((a) => {
          if (!a.enabled || a.trigger.type !== "cron") return [];
          const at = nextCronRun(a.trigger.expr, new Date(now))?.getTime();
          if (at === undefined || at - now > HORIZON_MS) return [];
          return [{ key: `${widget.id}:next:${a.id}`, automation: a, expr: a.trigger.expr, at }];
        })
        .sort((x, y) => x.at - y.at),
    [widget.id, automations, now],
  );

  useWidgetReport(
    {
      loading: isPending,
      count: isPending ? undefined : running.length + upcoming.length,
      you: 0,
    },
    { onEmptyChange, onCountChange },
  );

  if (running.length + upcoming.length === 0) return null;

  const open = (id: string, key: string) => () =>
    onOpen({ kind: "automation", id, widgetId: widget.id, key, href: `/work/automations/${id}` });
  const header = (group: "running" | "upcoming", count: number) =>
    count === 0 ? null : (
      <RowGroupHeader
        closed={!!closed[group]}
        count={String(count)}
        groupKey="—"
        label={t(`group.${group}`)}
        onToggle={() => setClosed((c) => ({ ...c, [group]: !c[group] }))}
        progress={0}
        title={t(`group.${group}`)}
      />
    );
  const time = (key: string, at: number) => (
    <span data-testid={`${AutomationRunsWidgetTestId.Time}-${key}`}>
      <BoardText tabular align="right" kind="meta">
        {hhmm.format(at)}
      </BoardText>
    </span>
  );

  return (
    <>
      {header("running", running.length)}
      {!closed["running"] &&
        running.map((r) => (
          <BoardRow
            columns="run"
            key={r.key}
            onClick={open(r.automationId, r.key)}
            rowKey={r.key}
            selected={selection?.key === r.key}
            sheetSide={sheetSide}
            tone={r.tone}
          >
            <RunTitle step={r.step} title={nameOf.get(r.automationId) ?? r.title} />
            <BoardLine gap="5">
              <BoardText tabular kind="meta">
                <RunElapsed startedAt={r.startedAt} />
              </BoardText>
            </BoardLine>
            {time(r.key, Date.parse(r.startedAt))}
          </BoardRow>
        ))}
      {header("upcoming", upcoming.length)}
      {!closed["upcoming"] &&
        upcoming.map((u) => (
          <BoardRow
            columns="run"
            key={u.key}
            onClick={open(u.automation.id, u.key)}
            rowKey={u.key}
            selected={selection?.key === u.key}
            sheetSide={sheetSide}
            tone="idle"
          >
            <RunTitle step={cronLabel(u.expr)} title={u.automation.name ?? u.automation.id} />
            <BoardLine gap="5">
              <BoardText tabular kind="meta">
                {relativeLabel(u.at, now, locale)}
              </BoardText>
            </BoardLine>
            {time(u.key, u.at)}
          </BoardRow>
        ))}
    </>
  );
}
