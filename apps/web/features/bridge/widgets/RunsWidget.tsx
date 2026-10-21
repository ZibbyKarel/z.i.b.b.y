"use client";

import {
  BoardColumnHeader,
  BoardLine,
  BoardRow,
  BoardText,
  Progress,
  type ProgressBarTone,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useLiveRuns } from "../../runs/components/TasksDockPanel";
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

/**
 * Running now: the live runs (the dock's list) as TASK · STEP / PROGRESS / ISSUE rows. The
 * progress bar is in the run's state colour (working pulses); a run without a percentage
 * (workflow / goal / queued) shows the indeterminate bar and `—`.
 */
export function RunsWidget({
  widget,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.runs");
  const live = useLiveRuns();
  const rows = useMemo(() => runRows(widget.id, live), [widget.id, live]);

  // `useLiveRuns` has no loading flag (an empty feed and a loading one read the same).
  useWidgetReport({ loading: false, count: rows.length, you: 0 }, { onEmptyChange, onCountChange });

  if (rows.length === 0) return null;
  return (
    <>
      <BoardColumnHeader columns="run">
        <BoardText kind="colHead">{t("colTask")}</BoardText>
        <BoardText kind="colHead">{t("colProgress")}</BoardText>
        <BoardText align="right" kind="colHead">
          {t("colIssue")}
        </BoardText>
      </BoardColumnHeader>
      {rows.map((r) => (
        <BoardRow
          columns="run"
          key={r.key}
          onClick={() => onOpen({ kind: "task", id: r.id, widgetId: widget.id, key: r.key })}
          rowKey={r.key}
          selected={selection?.key === r.key}
          tone={r.tone}
        >
          <BoardLine direction="col" gap="3">
            <BoardText kind="body">{r.title}</BoardText>
            <BoardText truncate kind="meta">
              {r.step}
            </BoardText>
          </BoardLine>
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
          <BoardText
            align="right"
            kind="link"
            tone={r.issue ? "ink" : "ink3"}
            underline={!!r.issue}
          >
            {r.issue ? `${r.issue} ↗` : r.project.toUpperCase()}
          </BoardText>
        </BoardRow>
      ))}
    </>
  );
}
