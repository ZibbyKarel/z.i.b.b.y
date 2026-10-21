"use client";

import { BoardLine, BoardRow, BoardTag, BoardText, IndentRail } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment, useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
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
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.prs");
  const tAll = useTranslations("bridge");
  const now = useNow(60_000);
  const filters = useBridgeInboxFilters();
  const prsQuery = useInboxPrsQuery();

  const { groups, visible } = useMemo(
    () =>
      prGroups(widget.id, prsQuery.data?.prs ?? [], filters, (iso) =>
        compactAgo(iso, now).toUpperCase(),
      ),
    [widget.id, prsQuery.data, filters, now],
  );

  useWidgetReport(
    {
      loading: prsQuery.isPending,
      count: prsQuery.isPending ? undefined : visible.length,
      you: groups.reduce((n, g) => n + [g.root, ...g.kids].filter((r) => r.needsYou).length, 0),
      clearAside: tAll("allClear"),
    },
    { onEmptyChange, onCountChange },
  );

  const card = (r: PrRowVm) => (
    <BoardRow
      key={r.key}
      needsYou={!!r.needsYou}
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
        {r.needsYou ? <BoardTag variant="you">{t("you", { wait: r.needsYou })}</BoardTag> : null}
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
      {groups.map((g) => (
        <Fragment key={g.root.key}>
          {card(g.root)}
          {g.kids.length > 0 ? <IndentRail>{g.kids.map(card)}</IndentRail> : null}
        </Fragment>
      ))}
    </>
  );
}
