"use client";

import { BoardLine, BoardRow, BoardText, IndentRail, RowGroupHeader } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment, useCallback, useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { useRefreshInboxMutation } from "../../inbox/mutations";
import { useInboxPrsQuery } from "../../inbox/queries";
import { type PrRowVm, prGroups } from "../state/rows";
import { useBridgeInboxFilters } from "../state/useBridgeInboxFilters";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

/**
 * Pull requests: the set the `/dashboard/inbox/pull-requests` screen lists (stored filters),
 * grouped by stack — root card, children indented behind a rail — most urgent group first.
 * No action buttons here; they live in the detail sheet.
 */
export function PrsWidget({
  widget,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
  sheetSide,
  epicClosed,
  onEpicToggle,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.prs");
  const now = useNow(60_000);
  const filters = useBridgeInboxFilters();
  const refresh = useRefreshInboxMutation();
  const { mutate } = refresh;
  // A failed sync just re-enables the button; the previous data stays on screen.
  const onRefresh = useCallback(() => mutate(), [mutate]);
  const prsQuery = useInboxPrsQuery();

  const { groups, visible } = useMemo(
    () => prGroups(widget.id, prsQuery.data?.prs ?? [], filters, (iso) => compactAgo(iso, now)),
    [widget.id, prsQuery.data, filters, now],
  );

  useWidgetReport(
    {
      onRefresh,
      refreshing: refresh.isPending,
      loading: prsQuery.isPending,
      count: prsQuery.isPending ? undefined : visible.length,
      you: 0,
    },
    { onEmptyChange, onCountChange },
  );

  const card = (r: PrRowVm) => (
    <BoardRow
      key={r.key}
      onClick={() => onOpen({ kind: "pr", id: r.id, widgetId: widget.id, key: r.key })}
      padding="pr"
      rowKey={r.key}
      selected={selection?.key === r.key}
      sheetSide={sheetSide}
      tone={r.tone}
    >
      <BoardLine baseline gap="8">
        <BoardText kind="prNum">{r.number}</BoardText>
        <BoardText kind="prTitle">{r.title}</BoardText>
      </BoardLine>
      <BoardLine wrap gap="6">
        <BoardText kind="prMeta">{r.meta}</BoardText>
      </BoardLine>
      <BoardLine wrap gap="8">
        <BoardText bold kind="prMeta" tone="ink">
          {t(`status.${r.statusKey}`)}
          {r.need === "merge" ? ` · ${t("need.merge")}` : ""}
        </BoardText>
        {r.on ? (
          <BoardText kind="prMeta" tone="ink3">
            {t("on", { base: r.on })}
          </BoardText>
        ) : null}
        {r.waits ? (
          <BoardText kind="prMeta" tone="ink3">
            {t("waitsOn", { prs: r.waits })}
          </BoardText>
        ) : null}
      </BoardLine>
    </BoardRow>
  );

  return (
    <>
      {groups.map((g, i) => {
        const first = i === 0 || g.section !== groups[i - 1]?.section;
        const sectionKey = `${widget.id}:${g.section}`;
        const closed = !!epicClosed[sectionKey];
        const title = t(g.section === "review" ? "section.toReview" : `section.${g.section}`);
        return (
          <Fragment key={g.root.key}>
            {first ? (
              <RowGroupHeader
                closed={closed}
                count={String(
                  groups
                    .filter((x) => x.section === g.section)
                    .reduce((n, x) => n + 1 + x.kids.length, 0),
                )}
                groupKey=""
                label={t("section.toggle", { title })}
                onToggle={() => onEpicToggle(sectionKey, !closed)}
                title={title}
              />
            ) : null}
            {closed ? null : (
              <>
                {card(g.root)}
                {g.kids.length > 0 ? <IndentRail>{g.kids.map(card)}</IndentRail> : null}
              </>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
