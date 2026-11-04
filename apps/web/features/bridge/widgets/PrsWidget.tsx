"use client";

import {
  BoardLine,
  BoardRow,
  BoardTag,
  BoardText,
  IconBadge,
  IndentRail,
  RowGroupHeader,
} from "@zibby/design-system";
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

  // A stack sits in its root's section; a row whose own ownership differs (a colleague's PR
  // stacked on mine, or mine on theirs) is tagged so the section never claims it.
  const card = (r: PrRowVm, sectionMine: boolean) => (
    <BoardRow
      key={r.key}
      onClick={() => onOpen({ kind: "pr", id: r.id, widgetId: widget.id, key: r.key })}
      padding="pr"
      rowKey={r.key}
      selected={selection?.key === r.key}
      sheetSide={sheetSide}
      tone={r.tone}
      trailing={
        r.conversations > 0 ? (
          <IconBadge
            count={r.conversations}
            icon="chat"
            label={t("conversations", { count: r.conversations })}
          />
        ) : undefined
      }
    >
      <BoardLine baseline gap="8">
        <BoardText kind="prNum">{r.number}</BoardText>
        <BoardText kind="prTitle">{r.title}</BoardText>
      </BoardLine>
      <BoardLine wrap gap="6">
        {r.mine !== sectionMine ? (
          <BoardTag variant="source">{t(r.mine ? "owner.mine" : "owner.other")}</BoardTag>
        ) : null}
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
        const sectionMine = g.section === "mine";
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
                {card(g.root, sectionMine)}
                {g.kids.length > 0 ? (
                  <IndentRail>{g.kids.map((k) => card(k, sectionMine))}</IndentRail>
                ) : null}
              </>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
