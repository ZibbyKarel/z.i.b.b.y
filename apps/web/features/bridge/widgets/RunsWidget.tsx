"use client";

import {
  BoardColumnHeader,
  BoardLine,
  BoardRow,
  BoardText,
  Progress,
  type ProgressBarTone,
  RowGroupHeader,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { useInvalidateOnTerminalRun, useLiveRuns } from "../../runs/components/TasksDockPanel";
import { useRecentArchivedRunsQuery } from "../../runs/queries/useRecentArchivedRunsQuery";
import { WAITING_STATES } from "../../runs/run";
import { runRows } from "../state/rows";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

const PROGRESS_TONE: Record<string, ProgressBarTone> = {
  working: "run",
  thinking: "accent",
  blocked: "warn",
  error: "bad",
  done: "ok",
  idle: "idle",
};

const FINISHED_LIMIT = 10;

/**
 * Running & finished: the active live runs (everything not waiting - those are the queue
 * widget's) as TASK · STEP / PROGRESS / ISSUE rows, then the last 10 finished runs with a
 * full bar in their outcome colour and their age. A group header is omitted when empty.
 */
export function RunsWidget({
  widget,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
  sheetSide,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.runs");
  const tRuns = useTranslations("runs");
  const now = useNow(60_000);
  const live = useLiveRuns();
  useInvalidateOnTerminalRun(FINISHED_LIMIT);
  const { data: archived, isPending } = useRecentArchivedRunsQuery(FINISHED_LIMIT);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const active = useMemo(
    () =>
      runRows(
        widget.id,
        live.filter((r) => !WAITING_STATES.has(r.status)),
      ),
    [widget.id, live],
  );
  const finished = useMemo(() => {
    const runs = (archived ?? []).slice(0, FINISHED_LIMIT);
    const rows = runRows(widget.id, runs);
    return rows.map((r, i) => {
      const run = runs[i];
      return {
        ...r,
        status: run?.status ?? "done",
        age: compactAgo(run?.taskOutcomeFinishedAt ?? run?.startedAt ?? "", now).toUpperCase(),
      };
    });
  }, [widget.id, archived, now]);

  useWidgetReport(
    {
      loading: isPending,
      count: isPending ? undefined : active.length + finished.length,
      you: 0,
    },
    { onEmptyChange, onCountChange },
  );

  if (active.length + finished.length === 0) return null;

  const open = (r: (typeof active)[number]) =>
    r.id === null
      ? undefined
      : () => onOpen({ kind: "task", id: r.id as string, widgetId: widget.id, key: r.key });
  const header = (group: "active" | "finished", count: number) =>
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

  return (
    <>
      <BoardColumnHeader columns="run">
        <BoardText kind="colHead">{t("colTask")}</BoardText>
        <BoardText kind="colHead">{t("colProgress")}</BoardText>
        <BoardText align="right" kind="colHead">
          {t("colIssue")}
        </BoardText>
      </BoardColumnHeader>
      {header("active", active.length)}
      {!closed["active"] &&
        active.map((r) => (
          <BoardRow
            columns="run"
            key={r.key}
            onClick={open(r)}
            rowKey={r.id === null ? undefined : r.key}
            selected={selection?.key === r.key}
            sheetSide={sheetSide}
            tone={r.tone}
          >
            <RunTitle step={r.step} title={r.title} />
            <BoardLine direction="col" gap="5">
              {r.pct === null ? (
                <Progress indeterminate height="25" />
              ) : (
                <Progress
                  height="25"
                  pulse={r.tone === "working"}
                  tone={PROGRESS_TONE[r.tone] ?? "idle"}
                  value={r.pct}
                />
              )}
              <BoardLine between gap="5">
                <BoardText tabular kind="meta">
                  {t(`state.${r.tone}`)}
                </BoardText>
                <BoardText tabular kind="meta">
                  {r.pct === null ? "—" : `${r.pct}%`}
                </BoardText>
              </BoardLine>
            </BoardLine>
            <RunIssue issue={r.issue} project={r.project} />
          </BoardRow>
        ))}
      {header("finished", finished.length)}
      {!closed["finished"] &&
        finished.map((r) => (
          <BoardRow
            columns="run"
            key={r.key}
            onClick={open(r)}
            rowKey={r.id === null ? undefined : r.key}
            selected={selection?.key === r.key}
            sheetSide={sheetSide}
            tone={r.tone}
          >
            <RunTitle step={r.step} title={r.title} />
            <BoardLine direction="col" gap="5">
              <Progress height="25" tone={PROGRESS_TONE[r.tone] ?? "idle"} value={100} />
              <BoardLine between gap="5">
                <BoardText tabular kind="meta">
                  {tRuns(`state.${r.status}`).toUpperCase()}
                </BoardText>
                <BoardText tabular kind="meta">
                  {r.age}
                </BoardText>
              </BoardLine>
            </BoardLine>
            <RunIssue issue={r.issue} project={r.project} />
          </BoardRow>
        ))}
    </>
  );
}

function RunTitle({ title, step }: { title: string; step: string }) {
  return (
    <BoardLine direction="col" gap="3">
      <BoardText kind="body">{title}</BoardText>
      <BoardText truncate kind="meta">
        {step}
      </BoardText>
    </BoardLine>
  );
}

function RunIssue({ issue, project }: { issue: string | null; project: string }) {
  return (
    <BoardText align="right" kind="link" tone={issue ? "ink" : "ink3"} underline={!!issue}>
      {issue ? `${issue} ↗` : project.toUpperCase()}
    </BoardText>
  );
}
