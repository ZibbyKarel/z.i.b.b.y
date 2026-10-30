"use client";

import { BoardLine, BoardRow, BoardText } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { clockTime, compactAgo } from "../../../utils/time";
import { useLiveRuns } from "../../runs/components/TasksDockPanel";
import { WAITING_STATES, runTitle } from "../../runs/run";
import { runRows } from "../state/rows";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

/**
 * Task queue: the live runs still waiting to start (queued / scheduled / held - the complement
 * of what the running widget shows), in feed order. Scheduled rows show their fire time, the
 * rest their age. The widget `type` stays `tasks` (saved layouts / presets).
 */
export function TasksWidget({
  widget,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
  sheetSide,
}: BridgeWidgetProps) {
  const t = useTranslations("runs");
  const locale = useLocale();
  const now = useNow(60_000);
  const live = useLiveRuns();

  const rows = useMemo(() => {
    const waiting = live.filter((r) => WAITING_STATES.has(r.status));
    const vms = runRows(widget.id, waiting);
    return waiting.map((run, i) => {
      const vm = vms[i];
      return {
        key: vm?.key ?? run.runId,
        // Scheduled runs open by their own id (the task), the rest by task id.
        id: (run.kind === "scheduled" ? run.runId : run.taskId) ?? null,
        tone: vm?.tone ?? "idle",
        title: runTitle(run),
        meta: [run.projectId ?? run.project, run.processor?.name ?? run.owner]
          .filter(Boolean)
          .join(" · "),
        state: t(`state.${run.status}`),
        when:
          run.status === "scheduled"
            ? clockTime(run.startedAt, locale)
            : compactAgo(run.startedAt, now),
      };
    });
  }, [widget.id, live, t, locale, now]);

  useWidgetReport({ loading: false, count: rows.length, you: 0 }, { onEmptyChange, onCountChange });

  return (
    <>
      {rows.map((r) => (
        <BoardRow
          columns="run"
          key={r.key}
          onClick={
            r.id === null
              ? undefined
              : () =>
                  onOpen({
                    kind: "task",
                    id: r.id as string,
                    widgetId: widget.id,
                    key: r.key,
                    href: `/work/tasks/${r.id}`,
                  })
          }
          rowKey={r.id === null ? undefined : r.key}
          selected={selection?.key === r.key}
          sheetSide={sheetSide}
          tone={r.tone}
        >
          <BoardLine direction="col" gap="3">
            <BoardText kind="body">{r.title}</BoardText>
            <BoardText truncate kind="meta">
              {r.meta}
            </BoardText>
          </BoardLine>
          <BoardText tabular kind="meta">
            {r.state}
          </BoardText>
          <BoardText align="right" kind="meta" tone="ink3">
            {r.when}
          </BoardText>
        </BoardRow>
      ))}
    </>
  );
}
