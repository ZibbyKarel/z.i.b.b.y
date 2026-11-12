"use client";

import type { AutomationView } from "@zibby/contracts";
import { BoardLine, BoardRow, BoardText, Icon, RowGroupHeader } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useNow } from "../../../hooks/useNow";
import { useAutomationsQuery } from "../../automations/queries";
import { SCHEDULE_TIME_ZONE, nextCronRun, relativeLabel } from "../../automations/schedule";
import { useCronLabel } from "../../automations/useCronLabel";
import { useLiveRuns } from "../../runs/components/TasksDockPanel";
import { useRunsQuery } from "../../runs/queries/useRunsQuery";
import type { RunView } from "../../runs/run";
import { runRows } from "../state/rows";
import type { BridgeWidgetProps } from "./registry";
import { RunElapsed, RunTitle } from "./RunsWidget";
import { useWidgetReport } from "./useWidgetReport";

export enum AutomationRunsWidgetTestId {
  /** The row's 24h time cell — suffixed `-<row key>`. */
  Time = "automation-runs-widget-time",
  /** The failed marker on an upcoming or failed row (todo-5) — suffixed `-<row key>`. */
  Failed = "automation-runs-widget-failed",
  /** The system (shield) / user icon left of the title (todo-7) — suffixed `-<row key>`. */
  Kind = "automation-runs-widget-kind",
}

/** todo-7: shield (warn) for a system automation, user (accent) for a user one. */
function AutomationTitle({
  rowKey,
  automation,
  step,
}: {
  rowKey: string;
  automation: AutomationView;
  step: string;
}) {
  const t = useTranslations("bridge.widgets.automationRuns.kind");
  const label = t(automation.system ? "system" : "user");
  return (
    <BoardLine gap="6">
      <span
        aria-label={label}
        data-kind={automation.system ? "system" : "user"}
        data-testid={`${AutomationRunsWidgetTestId.Kind}-${rowKey}`}
        role="img"
        title={label}
      >
        <Icon
          name={automation.system ? "shield" : "user"}
          size="sm"
          tone={automation.system ? "warn" : "accent"}
        />
      </span>
      <RunTitle step={step} title={automation.name ?? automation.id} />
    </BoardLine>
  );
}

/** How far ahead "upcoming" looks — also bounds the minute-by-minute cron scan. */
const HORIZON_MINUTES = 24 * 60;
/** How long a failed fire keeps marking its automation (todo-5). */
const FAILED_WINDOW_MS = 24 * 60 * 60_000;

export type AutomationRowState =
  | { kind: "running"; startedAt: string }
  | { kind: "failed"; at: string }
  | { kind: "idle" };

/**
 * todo-5: what an automation's row shows. Running = a live run it fired, or its in-process
 * fire still running. Failed = its latest fire errored within 24 h, or its latest run
 * errored within 24 h and no newer fire followed that run. Else idle (the countdown).
 */
export function automationRowState(
  a: AutomationView,
  liveRun: RunView | undefined,
  latestRun: RunView | undefined,
  now: number,
): AutomationRowState {
  if (liveRun) return { kind: "running", startedAt: liveRun.startedAt };
  const fire = a.lastFire;
  if (fire?.status === "running") return { kind: "running", startedAt: fire.startedAt };
  const recent = (at: string) => now - Date.parse(at) <= FAILED_WINDOW_MS;
  if (fire?.status === "error" && fire.finishedAt && recent(fire.finishedAt)) {
    return { kind: "failed", at: fire.finishedAt };
  }
  if (latestRun?.status === "error") {
    const at = latestRun.taskOutcomeFinishedAt ?? latestRun.startedAt;
    const fireIsThisRunOrOlder =
      !fire ||
      fire.runRef === latestRun.runId ||
      Date.parse(fire.startedAt) <= Date.parse(latestRun.startedAt);
    if (fireIsThisRunOrOlder && recent(at)) return { kind: "failed", at };
  }
  return { kind: "idle" };
}

/**
 * Automation runs: the live runs an automation fired (same row design as the Runs widget) and its
 * in-process fires still running, then each other enabled cron automation's next fire within the
 * next 24 h, soonest first — an automation that failed in the last 24 h shows "Failed <ago>" in
 * place of the countdown (todo-5). Times are 24h
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
  const { runs: allRuns } = useRunsQuery();
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
  const byId = useMemo(() => new Map((automations ?? []).map((a) => [a.id, a])), [automations]);

  const running = useMemo(() => {
    const runs = live.filter((r) => r.automationId);
    return runRows(widget.id, runs).map((row, i) => ({
      ...row,
      automationId: runs[i]?.automationId ?? "",
    }));
  }, [widget.id, live]);

  // In-process fires still running (a run-backed fire shows as its live run above).
  const firing = useMemo(
    () =>
      (automations ?? []).flatMap((a) => {
        const startedAt = a.lastFire?.status === "running" ? a.lastFire.startedAt : undefined;
        if (!startedAt || running.some((r) => r.automationId === a.id)) return [];
        return [{ key: `${widget.id}:fire:${a.id}`, automation: a, startedAt }];
      }),
    [widget.id, automations, running],
  );

  const latestRunOf = useMemo(() => {
    const latest = new Map<string, RunView>();
    for (const r of allRuns) {
      if (!r.automationId) continue;
      const prev = latest.get(r.automationId);
      if (!prev || r.startedAt > prev.startedAt) latest.set(r.automationId, r);
    }
    return latest;
  }, [allRuns]);

  // One pass: an enabled cron automation with a slot in the next 24 h is upcoming (marked when
  // it failed); any other automation that failed in the last 24 h (event/signal trigger,
  // disabled, no slot soon) gets a failed row in the running group (todo-5).
  const { upcoming, failed } = useMemo(() => {
    const busy = new Set([
      ...running.map((r) => r.automationId),
      ...firing.map((f) => f.automation.id),
    ]);
    const upcoming: {
      key: string;
      automation: AutomationView;
      expr: string;
      at: number;
      failedAt?: number;
    }[] = [];
    const failed: { key: string; automation: AutomationView; at: number }[] = [];
    for (const a of automations ?? []) {
      if (busy.has(a.id)) continue;
      const state = automationRowState(a, undefined, latestRunOf.get(a.id), now);
      const failedAt = state.kind === "failed" ? Date.parse(state.at) : undefined;
      const expr = a.enabled && a.trigger.type === "cron" ? a.trigger.expr : undefined;
      const at = expr ? nextCronRun(expr, new Date(now), HORIZON_MINUTES)?.getTime() : undefined;
      if (expr && at !== undefined) {
        upcoming.push({ key: `${widget.id}:next:${a.id}`, automation: a, expr, at, failedAt });
      } else if (failedAt !== undefined) {
        failed.push({ key: `${widget.id}:failed:${a.id}`, automation: a, at: failedAt });
      }
    }
    return { upcoming: upcoming.sort((x, y) => x.at - y.at), failed };
  }, [widget.id, automations, now, running, firing, latestRunOf]);

  useWidgetReport(
    {
      loading: isPending,
      count: isPending
        ? undefined
        : running.length + firing.length + failed.length + upcoming.length,
      you: 0,
    },
    { onEmptyChange, onCountChange },
  );

  if (running.length + firing.length + failed.length + upcoming.length === 0) return null;

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
      {header("running", running.length + firing.length + failed.length)}
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
            {(() => {
              const a = byId.get(r.automationId);
              return a ? (
                <AutomationTitle automation={a} rowKey={r.key} step={r.step} />
              ) : (
                <RunTitle step={r.step} title={r.title} />
              );
            })()}
            <BoardLine gap="5">
              <BoardText tabular kind="meta">
                <RunElapsed startedAt={r.startedAt} />
              </BoardText>
            </BoardLine>
            {time(r.key, Date.parse(r.startedAt))}
          </BoardRow>
        ))}
      {!closed["running"] &&
        firing.map((f) => (
          <BoardRow
            columns="run"
            key={f.key}
            onClick={open(f.automation.id, f.key)}
            rowKey={f.key}
            selected={selection?.key === f.key}
            sheetSide={sheetSide}
            tone="working"
          >
            <AutomationTitle
              automation={f.automation}
              rowKey={f.key}
              step={f.automation.target.type}
            />
            <BoardLine gap="5">
              <BoardText tabular kind="meta">
                <RunElapsed startedAt={f.startedAt} />
              </BoardText>
            </BoardLine>
            {time(f.key, Date.parse(f.startedAt))}
          </BoardRow>
        ))}
      {!closed["running"] &&
        failed.map((f) => (
          <BoardRow
            columns="run"
            key={f.key}
            onClick={open(f.automation.id, f.key)}
            rowKey={f.key}
            selected={selection?.key === f.key}
            sheetSide={sheetSide}
            tone="error"
          >
            <AutomationTitle
              automation={f.automation}
              rowKey={f.key}
              step={f.automation.target.type}
            />
            <BoardLine gap="5">
              <span data-testid={`${AutomationRunsWidgetTestId.Failed}-${f.key}`}>
                <BoardText tabular kind="meta">
                  {t("failed", { ago: relativeLabel(f.at, now, locale) })}
                </BoardText>
              </span>
            </BoardLine>
            {time(f.key, f.at)}
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
            tone={u.failedAt === undefined ? "idle" : "error"}
          >
            <AutomationTitle automation={u.automation} rowKey={u.key} step={cronLabel(u.expr)} />
            <BoardLine gap="5">
              {u.failedAt === undefined ? (
                <BoardText tabular kind="meta">
                  {relativeLabel(u.at, now, locale)}
                </BoardText>
              ) : (
                <span data-testid={`${AutomationRunsWidgetTestId.Failed}-${u.key}`}>
                  <BoardText tabular kind="meta">
                    {t("failed", { ago: relativeLabel(u.failedAt, now, locale) })}
                  </BoardText>
                </span>
              )}
            </BoardLine>
            {time(u.key, u.at)}
          </BoardRow>
        ))}
    </>
  );
}
