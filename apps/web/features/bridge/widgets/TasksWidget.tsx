"use client";

import { BoardRow, BoardTag, BoardText, PipelineChips } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { useTaskParentsInfiniteQuery } from "../../tasks/queries";
import { taskRows } from "../state/rows";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

/**
 * Tasks: the `/work/tasks` parent-task feed (newest first, first page, unfiltered), done
 * hidden. Pipeline chips are the task's department subtasks; blocked tasks carry `YOU`.
 */
export function TasksWidget({
  widget,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
  sheetSide,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.tasks");
  const tAll = useTranslations("bridge");
  const now = useNow(60_000);
  const departments = useDepartmentLookup();
  const { data, isPending } = useTaskParentsInfiniteQuery({});

  const rows = useMemo(
    () => taskRows(widget.id, data ?? [], departments, (iso) => compactAgo(iso, now).toUpperCase()),
    [widget.id, data, departments, now],
  );

  useWidgetReport(
    {
      loading: isPending,
      count: isPending ? undefined : rows.length,
      you: rows.filter((r) => r.needsYou).length,
      clearAside: tAll("allClear"),
    },
    { onEmptyChange, onCountChange },
  );

  return (
    <>
      {rows.map((r) => (
        <BoardRow
          columns="task"
          key={r.key}
          needsYou={r.needsYou}
          onClick={() => onOpen({ kind: "task", id: r.id, widgetId: widget.id, key: r.key })}
          rowKey={r.key}
          selected={selection?.key === r.key}
          sheetSide={sheetSide}
          tone={r.tone}
        >
          <BoardText kind="id">{r.code}</BoardText>
          <BoardText kind="body">{r.title}</BoardText>
          <PipelineChips chips={r.chips} />
          {r.needsYou ? (
            <BoardTag variant="you">{t("you")}</BoardTag>
          ) : (
            <BoardText align="right" kind="meta" tone="ink3">
              {r.age}
            </BoardText>
          )}
        </BoardRow>
      ))}
    </>
  );
}
