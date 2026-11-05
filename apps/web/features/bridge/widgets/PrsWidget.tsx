"use client";

import {
  BoardLead,
  BoardLine,
  BoardRow,
  BoardText,
  Container,
  FilterBar,
  Icon,
  IconBadge,
  type IconName,
  IconTile,
  type IconTone,
  IndentRail,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode, useCallback, useMemo, useState } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { useRefreshInboxMutation } from "../../inbox/mutations";
import { useInboxPrsQuery } from "../../inbox/queries";
import { useTeamsQuery } from "../../teams/queries";
import { type PrFilterPick, type PrNodeVm, type PrRowVm, prTeams, prTree } from "../state/rows";
import { useBridgeInboxFilters } from "../state/useBridgeInboxFilters";
import { CI_ICON, PrFilterControls, REVIEW_ICON } from "./PrFilterControls";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export enum PrsWidgetTestId {
  Avatar = "prs-widget-avatar",
  Ci = "prs-widget-ci",
  Review = "prs-widget-review",
}

/** Stack levels drawn as indentation; deeper PRs line up with the last one. */
const MAX_INDENT = 3;

/** A status glyph with its meaning as the accessible name and the hover tooltip. */
function StateIcon({
  icon,
  label,
  testId,
}: {
  icon: { name: IconName; tone: IconTone };
  label: string;
  testId: string;
}) {
  return (
    <span aria-label={label} data-testid={testId} role="img" title={label}>
      <Icon name={icon.name} size="sm" tone={icon.tone} />
    </span>
  );
}

/**
 * Pull requests: the set the `/dashboard/inbox/pull-requests` screen lists (stored filters) as
 * one flat list, newest first, each stack kept together (base -> head, indented behind a rail).
 * The filter row above narrows by review / CI state, owner and team and doubles as the legend of the card icons.
 * No action buttons here; they live in the detail sheet.
 */
export function PrsWidget({
  widget,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
  sheetSide,
  filtersOpen,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.prs");
  const now = useNow(60_000);
  const filters = useBridgeInboxFilters();
  const refresh = useRefreshInboxMutation();
  const { mutate } = refresh;
  // A failed sync just re-enables the button; the previous data stays on screen.
  const onRefresh = useCallback(() => mutate(), [mutate]);
  const prsQuery = useInboxPrsQuery();
  const { data: configuredTeams } = useTeamsQuery();
  const defaults = widget.prFilters;
  const [pick, setPick] = useState<PrFilterPick>(defaults ?? {});
  // Saving new defaults in the widget settings resets the local pick to them. Keyed by content:
  // the parent may rebuild the object without the defaults having changed.
  const defaultsKey = JSON.stringify(defaults ?? {});
  const [seenKey, setSeenKey] = useState(defaultsKey);
  if (seenKey !== defaultsKey) {
    setSeenKey(defaultsKey);
    setPick(defaults ?? {});
  }
  const teams = useMemo(
    () => prTeams(prsQuery.data?.prs ?? [], defaults?.teams, configuredTeams),
    [prsQuery.data, defaults?.teams, configuredTeams],
  );

  const { nodes, counts, total, you } = useMemo(
    () => prTree(widget.id, prsQuery.data?.prs ?? [], filters, pick, (iso) => compactAgo(iso, now)),
    [widget.id, prsQuery.data, filters, pick, now],
  );
  // The header counts the whole set, not the picked slice: an empty pick must not collapse the
  // widget (and its filter with it).

  useWidgetReport(
    {
      onRefresh,
      refreshing: refresh.isPending,
      loading: prsQuery.isPending,
      count: prsQuery.isPending ? undefined : total,
      you,
      filtersActive: Object.keys(pick).length > 0,
    },
    { onEmptyChange, onCountChange },
  );

  const card = (r: PrRowVm) => (
    <BoardRow
      key={r.key}
      muted={r.muted}
      onClick={() => onOpen({ kind: "pr", id: r.id, widgetId: widget.id, key: r.key })}
      padding="pr"
      rowKey={r.key}
      selected={selection?.key === r.key}
      sheetSide={sheetSide}
      tone={r.tone}
      trailing={
        <BoardLine gap="8">
          {r.conversations > 0 ? (
            <IconBadge
              count={r.conversations}
              icon="chat"
              label={t("conversations", { count: r.conversations })}
            />
          ) : null}
          <StateIcon icon={CI_ICON[r.ci]} label={t(`ci.${r.ci}`)} testId={PrsWidgetTestId.Ci} />
          <StateIcon
            icon={REVIEW_ICON[r.review]}
            label={t(`reviewHint.${r.reviewHint}`)}
            testId={PrsWidgetTestId.Review}
          />
        </BoardLine>
      }
    >
      <BoardLead
        lead={
          <IconTile
            alt={r.author}
            aria-label={r.author}
            data-testid={PrsWidgetTestId.Avatar}
            filled={false}
            role="img"
            shape="circle"
            size="md"
            src={r.avatarUrl}
            title={r.author}
            tone="neutral"
          >
            {r.author.charAt(0).toUpperCase()}
          </IconTile>
        }
      >
        <BoardLine baseline gap="8">
          <BoardText kind="prNum">{r.number}</BoardText>
          <BoardText truncate kind="prTitle" title={r.title}>
            {r.title}
          </BoardText>
        </BoardLine>
        {/* Not wrapped: when the line runs out of room the project clips first, then the name. */}
        <BoardLine
          end={
            <BoardText kind="meta" tone="ink3">
              {r.age}
            </BoardText>
          }
          gap="6"
        >
          <BoardText kind="prMeta">{r.author}</BoardText>
          <BoardText kind="prMeta" tone="ink3">
            · {r.project}
          </BoardText>
        </BoardLine>
      </BoardLead>
    </BoardRow>
  );

  const tree = (n: PrNodeVm, depth: number): ReactNode => {
    const kids = n.kids.map((k) => tree(k, depth + 1));
    return (
      <Fragment key={n.row.key}>
        {card(n.row)}
        {kids.length === 0 ? null : depth < MAX_INDENT ? <IndentRail>{kids}</IndentRail> : kids}
      </Fragment>
    );
  };

  return (
    <>
      {filtersOpen ? (
        <Container padding={["100", "150"]}>
          <FilterBar>
            <PrFilterControls counts={counts} onChange={setPick} pick={pick} teams={teams} />
          </FilterBar>
        </Container>
      ) : null}
      {nodes.map((n) => tree(n, 0))}
    </>
  );
}
