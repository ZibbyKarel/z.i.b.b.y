"use client";

import {
  BoardLead,
  BoardLine,
  BoardRow,
  BoardTag,
  BoardText,
  IconTile,
  RowGroupHeader,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment, useCallback, useMemo } from "react";
import { sourceIcon } from "../../integrations/kindIcon";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { itemScope, passesFilters, visibleItems } from "../../inbox/inbox";
import { useRefreshInboxMutation } from "../../inbox/mutations";
import { useInboxItemsQuery, useInboxPrsQuery } from "../../inbox/queries";
import { type IssueRowVm, issueGroups } from "../state/rows";
import { useBridgeInboxFilters } from "../state/useBridgeInboxFilters";
import { useTeamsQuery } from "../../teams/queries";
import type { BridgeWidgetProps, WidgetFiltersProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";
import {
  OrgFilterControls,
  WidgetFilterBar,
  compactPick,
  useWidgetFilterPick,
} from "./widgetFilters";

export enum IssuesWidgetTestId {
  Source = "issues-widget-source",
}

/** Company + team filters of the Issues widget; a team matches the team of the issue's project. */
export function IssuesFilterControls({ pick, onChange }: WidgetFiltersProps) {
  const { data: teams = [] } = useTeamsQuery();
  return (
    <OrgFilterControls
      onChange={(patch) => onChange(compactPick({ ...pick, ...patch }))}
      pick={pick}
      teams={teams.map((t) => ({
        value: t.id,
        label: t.name,
        ...(t.companyId ? { companyId: t.companyId } : {}),
      }))}
    />
  );
}

/**
 * Issues: exactly the set the `/dashboard/inbox/issues` screen lists with its defaults (stored
 * company/team/project filters, no search, done + hidden off), waiting-for-you first, grouped
 * under the epic. A group header collapses its epic (`epicClosed`). The filter row narrows the
 * list further by company and team (defaults from `widget.filters`).
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
  filtersOpen,
}: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.issues");
  const stateText = (r: IssueRowVm) =>
    r.status === "new" || r.status === "running" ? r.sourceStatus : t(`state.${r.status}`);
  const now = useNow(60_000);
  const filters = useBridgeInboxFilters();
  const refresh = useRefreshInboxMutation();
  const { mutate } = refresh;
  // A failed sync just re-enables the button; the previous data stays on screen.
  const onRefresh = useCallback(() => mutate(), [mutate]);
  const itemsQuery = useInboxItemsQuery();
  const prsQuery = useInboxPrsQuery();
  const [pick, setPick] = useWidgetFilterPick(widget.filters);

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
  // The header counts the whole set, not the picked slice: an empty pick must not collapse the
  // widget (and its filter with it).
  const picked = useMemo(() => {
    const org = { company: pick.companies ?? [], team: pick.teams ?? [], project: [] };
    return list.filter((item) => passesFilters(org, itemScope(item)));
  }, [list, pick]);
  const groups = useMemo(
    () =>
      issueGroups(
        widget.id,
        picked,
        itemsQuery.data?.epics ?? [],
        prsQuery.data?.prs ?? [],
        (iso) => compactAgo(iso, now),
      ),
    [widget.id, picked, itemsQuery.data, prsQuery.data, now],
  );

  const you = groups.reduce((n, g) => n + g.rows.filter((r) => r.needsYou).length, 0);
  useWidgetReport(
    {
      onRefresh,
      refreshing: refresh.isPending,
      loading: itemsQuery.isPending,
      count: itemsQuery.isPending ? undefined : list.length,
      you,
      filtersActive: Object.keys(pick).length > 0,
    },
    { onEmptyChange, onCountChange },
  );

  return (
    <>
      <WidgetFilterBar open={filtersOpen}>
        <IssuesFilterControls onChange={setPick} pick={pick} />
      </WidgetFilterBar>
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
                      onOpen({
                        kind: "issue",
                        id: r.id,
                        widgetId: widget.id,
                        key: r.key,
                        // `r.id` is `chainKey(item)` = `<projectId>/<itemId>` — what `issueHref` builds.
                        href: `/dashboard/inbox/issues/${r.id}`,
                      })
                    }
                    rowKey={r.key}
                    selected={selection?.key === r.key}
                    sheetSide={sheetSide}
                    tone={r.tone}
                  >
                    <BoardLead
                      lead={
                        <IconTile
                          {...sourceIcon(r.sourceKind)}
                          alt={r.source}
                          aria-label={r.source}
                          data-testid={IssuesWidgetTestId.Source}
                          filled={false}
                          radius="sm"
                          role="img"
                          size="md"
                          title={r.source}
                          tone="neutral"
                        />
                      }
                    >
                      <BoardLine
                        end={
                          r.needsYou ? (
                            <BoardTag variant="you">{t("you", { wait: r.needsYou })}</BoardTag>
                          ) : undefined
                        }
                        gap="6"
                      >
                        <BoardText kind="id">{r.code}</BoardText>
                        <BoardText kind="title">{r.title}</BoardText>
                      </BoardLine>
                      <BoardLine
                        end={
                          <BoardText kind="meta" tone="ink3">
                            {r.age}
                          </BoardText>
                        }
                        gap="6"
                      >
                        {stateText(r) ? (
                          <BoardText kind="meta" tone="ink">
                            {stateText(r)}
                          </BoardText>
                        ) : null}
                        <BoardText kind="meta" tone="ink3">
                          {stateText(r) ? "· " : ""}
                          {r.project}
                        </BoardText>
                        {r.pr ? (
                          <BoardText underline kind="meta">
                            · {r.pr}
                          </BoardText>
                        ) : null}
                      </BoardLine>
                    </BoardLead>
                  </BoardRow>
                ))}
          </Fragment>
        );
      })}
    </>
  );
}
