"use client";

import {
  BoardGrid,
  BoardLine,
  BoardRow,
  BoardTag,
  BoardText,
  RowGroupHeader,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment, useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { visibleItems } from "../../inbox/inbox";
import { useInboxItemsQuery, useInboxPrsQuery } from "../../inbox/queries";
import { issueGroups } from "../state/rows";
import { useBridgeInboxFilters } from "../state/useBridgeInboxFilters";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

/**
 * Issues: exactly the set the `/dashboard/inbox/issues` screen lists with its defaults (stored
 * company/team/project filters, no search, done + hidden off), waiting-for-you first, grouped
 * under the epic. A group header collapses its epic (`epicClosed`).
 */
export function IssuesWidget({
  widget,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
  sheetSide,
  epicClosed,
  onEpicToggle,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.issues");
  const tAll = useTranslations("bridge");
  const now = useNow(60_000);
  const filters = useBridgeInboxFilters();
  const itemsQuery = useInboxItemsQuery();
  const prsQuery = useInboxPrsQuery();

  const list = useMemo(
    () =>
      visibleItems(itemsQuery.data?.items ?? [], {
        filters,
        search: "",
        showDone: false,
        showHidden: false,
      }),
    [itemsQuery.data, filters],
  );
  const groups = useMemo(
    () =>
      issueGroups(widget.id, list, itemsQuery.data?.epics ?? [], prsQuery.data?.prs ?? [], (iso) =>
        compactAgo(iso, now).toUpperCase(),
      ),
    [widget.id, list, itemsQuery.data, prsQuery.data, now],
  );

  const you = groups.reduce((n, g) => n + g.rows.filter((r) => r.needsYou).length, 0);
  useWidgetReport(
    {
      loading: itemsQuery.isPending,
      count: itemsQuery.isPending ? undefined : list.length,
      you,
      clearAside: tAll("allClear"),
    },
    { onEmptyChange, onCountChange },
  );

  return (
    <>
      {groups.map((g) => {
        const title = g.epic?.title ?? t("noEpic");
        const closed = !!epicClosed[g.key];
        return (
          <Fragment key={g.key}>
            <RowGroupHeader
              closed={closed}
              count={g.count}
              groupKey={g.epic?.key ?? "—"}
              label={t("epicToggle", { title })}
              onToggle={() => onEpicToggle(g.key, !closed)}
              progress={g.progress}
              title={title}
            />
            {closed
              ? null
              : g.rows.map((r) => (
                  <BoardRow
                    key={r.key}
                    needsYou={!!r.needsYou}
                    onClick={() =>
                      onOpen({ kind: "issue", id: r.id, widgetId: widget.id, key: r.key })
                    }
                    rowKey={r.key}
                    selected={selection?.key === r.key}
                    sheetSide={sheetSide}
                    tone={r.tone}
                  >
                    <BoardGrid columns="issue">
                      <BoardText kind="id">{r.code}</BoardText>
                      <BoardText kind="title">{r.title}</BoardText>
                      {r.needsYou ? (
                        <BoardTag variant="you">{t("you", { wait: r.needsYou })}</BoardTag>
                      ) : (
                        <span />
                      )}
                    </BoardGrid>
                    <BoardLine
                      indent
                      end={
                        <BoardText kind="meta" tone="ink3">
                          {r.age}
                        </BoardText>
                      }
                      gap="6"
                    >
                      <BoardTag variant="source">{r.source}</BoardTag>
                      <BoardText kind="meta" tone="ink">
                        {t(`state.${r.status}`)}
                      </BoardText>
                      <BoardText kind="meta" tone="ink3">
                        · {r.project}
                      </BoardText>
                      {r.pr ? (
                        <BoardText underline kind="meta">
                          · {r.pr}
                        </BoardText>
                      ) : null}
                    </BoardLine>
                  </BoardRow>
                ))}
          </Fragment>
        );
      })}
    </>
  );
}
