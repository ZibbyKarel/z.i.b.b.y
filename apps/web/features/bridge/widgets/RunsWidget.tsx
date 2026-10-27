"use client";

import {
  BoardLine,
  BoardRow,
  BoardText,
  Icon,
  type IconName,
  type IconTone,
  Progress,
  type ProgressBarTone,
  RowGroupHeader,
  type StateTone,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { useInvalidateOnTerminalRun, useLiveRuns } from "../../runs/components/TasksDockPanel";
import { useRecentArchivedRunsQuery } from "../../runs/queries/useRecentArchivedRunsQuery";
import { WAITING_STATES } from "../../runs/run";
import { useWorkflowsQuery } from "../../workflows";
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

const STATE_ICON: Record<StateTone, { name: IconName; tone: IconTone }> = {
  done: { name: "check", tone: "ok" },
  error: { name: "x", tone: "bad" },
  blocked: { name: "pause", tone: "warn" },
  thinking: { name: "wait", tone: "accent" },
  working: { name: "run", tone: "run" },
  idle: { name: "stop", tone: "dim" },
};

export enum RunsWidgetTestId {
  StateIcon = "runs-widget-state-icon",
  Progress = "runs-widget-progress",
}

const FINISHED_LIMIT = 10;

/**
 * Runs (running & finished): the active live runs (everything not waiting - those are the queue
 * widget's) as TASK · STEP / PROGRESS / ISSUE rows (a bar only while running: fill = completed phases, indeterminate without a phase list; a state icon otherwise), then the last 10 finished runs with a
 * state icon in their outcome colour and their age. A group header is omitted when empty. Every row
 * opens the run sheet (approval, phase output, artifacts).
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

  const { data: workflows } = useWorkflowsQuery();
  const phasesByWorkflow = useMemo(
    () =>
      new Map(
        (workflows ?? []).map((w) => [
          w.id,
          w.phases.map((p) => p.id).filter((id): id is string => !!id),
        ]),
      ),
    [workflows],
  );
  const active = useMemo(
    () =>
      runRows(
        widget.id,
        live.filter((r) => !WAITING_STATES.has(r.status)),
        phasesByWorkflow,
      ),
    [widget.id, live, phasesByWorkflow],
  );
  const finished = useMemo(() => {
    const runs = (archived ?? []).slice(0, FINISHED_LIMIT);
    const rows = runRows(widget.id, runs);
    return rows.map((r, i) => {
      const run = runs[i];
      return {
        ...r,
        status: run?.status ?? "done",
        age: compactAgo(run?.taskOutcomeFinishedAt ?? run?.startedAt ?? "", now),
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

  const open = (r: (typeof active)[number]) => () =>
    onOpen({ kind: "run", id: r.runId, widgetId: widget.id, key: r.key });
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
      {header("active", active.length)}
      {!closed["active"] &&
        active.map((r) => (
          <BoardRow
            columns="run"
            key={r.key}
            onClick={open(r)}
            rowKey={r.key}
            selected={selection?.key === r.key}
            sheetSide={sheetSide}
            tone={r.tone}
          >
            <RunTitle step={r.step} title={r.title} />
            <BoardLine direction="col" gap="5">
              {r.status === "running" ? (
                <span data-testid={`${RunsWidgetTestId.Progress}-${r.key}`}>
                  {r.pct === null ? (
                    <Progress indeterminate height="25" label={t("progressLabel")} />
                  ) : (
                    <Progress
                      height="25"
                      label={t("progressLabel")}
                      pulse={r.tone === "working"}
                      tone={PROGRESS_TONE[r.tone] ?? "idle"}
                      value={r.pct}
                    />
                  )}
                </span>
              ) : (
                <RunStateIcon runKey={r.key} tone={r.tone} />
              )}
              <BoardLine between gap="5">
                <BoardText tabular kind="meta">
                  {r.status === "awaiting-approval"
                    ? tRuns("state.awaiting-approval")
                    : t(`state.${r.tone}`)}
                </BoardText>
                <BoardText tabular kind="meta">
                  {r.stages && r.pct !== null ? t("stages", { ...r.stages, pct: r.pct }) : "—"}
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
            rowKey={r.key}
            selected={selection?.key === r.key}
            sheetSide={sheetSide}
            tone={r.tone}
          >
            <RunTitle step={r.step} title={r.title} />
            <BoardLine direction="col" gap="5">
              <RunStateIcon runKey={r.key} tone={r.tone} />
              <BoardLine between gap="5">
                <BoardText tabular kind="meta">
                  {tRuns(`state.${r.status}`)}
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

/** Non-running rows show their state as an icon in the state colour (the text beside it names it). */
function RunStateIcon({ tone, runKey }: { tone: StateTone; runKey: string }) {
  const { name, tone: iconTone } = STATE_ICON[tone] ?? STATE_ICON.idle;
  return (
    <span data-testid={`${RunsWidgetTestId.StateIcon}-${runKey}`}>
      <Icon aria-hidden name={name} size="sm" tone={iconTone} />
    </span>
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
      {issue ? `${issue} ↗` : project}
    </BoardText>
  );
}
