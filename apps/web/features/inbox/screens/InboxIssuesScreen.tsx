"use client";

import {
  Button,
  Container,
  EmptyState,
  Kbd,
  Row,
  SearchInput,
  Stack,
  ToggleField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "../../../hooks/useNow";
import { useTeamsQuery } from "../../teams";
import { EpicAccordion } from "../components/EpicAccordion";
import { InboxPage } from "../components/InboxPage";
import { IssueRow } from "../components/IssueRow";
import { findPr, groupByEpic, hiddenCount, linkedPrOf, pad2, visibleItems } from "../inbox";
import { useInboxItemsQuery, useInboxPrsQuery } from "../queries";
import { useInboxFilters } from "../useInboxFilters";
import { useInboxItemActions } from "../useInboxItemActions";
import { useSessionFlags } from "../useSessionFlags";

export enum InboxIssuesScreenTestId {
  Search = "inbox-issues-search",
  GroupByEpic = "inbox-issues-group-by-epic",
  ShowDone = "inbox-issues-show-done",
  ShowHidden = "inbox-issues-show-hidden",
  Empty = "inbox-issues-empty",
  ShowDoneNow = "inbox-issues-show-done-now",
  Meta = "inbox-issues-meta",
}

const OPEN_STORAGE_KEY = "zibby-inbox-epics-open";

/**
 * `/dashboard/inbox/issues` — the operator's roadmap items across all projects: search,
 * the shared company / team / project filters, toggles (group by epic, show done,
 * show hidden), sorted new → waiting → running. `/` focuses the search.
 */
export function InboxIssuesScreen() {
  const t = useTranslations("inboxPage");
  const now = useNow(60_000);
  const { filters } = useInboxFilters();
  const itemsQuery = useInboxItemsQuery();
  const prsQuery = useInboxPrsQuery();
  const { data: teams } = useTeamsQuery();
  const actions = useInboxItemActions();

  const [search, setSearch] = useState("");
  const [groupByEpicOn, setGroupByEpic] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [open, setOpenFlag] = useSessionFlags(OPEN_STORAGE_KEY);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      ) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo(() => itemsQuery.data?.items ?? [], [itemsQuery.data]);
  const epics = useMemo(() => itemsQuery.data?.epics ?? [], [itemsQuery.data]);
  const prs = useMemo(() => prsQuery.data?.prs ?? [], [prsQuery.data]);
  const teamNames = useMemo(() => new Map((teams ?? []).map((x) => [x.id, x.name])), [teams]);

  const list = useMemo(
    () => visibleItems(items, { filters, search, showDone, showHidden }),
    [items, filters, search, showDone, showHidden],
  );
  const groups = useMemo(
    () => (groupByEpicOn ? groupByEpic(list, epics) : []),
    [groupByEpicOn, list, epics],
  );
  const hidden = hiddenCount(items, filters);
  const trimmed = search.trim();

  return (
    <InboxPage
      errors={[...(itemsQuery.data?.errors ?? []), ...(prsQuery.data?.errors ?? [])]}
      items={itemsQuery.data}
      status={itemsQuery}
      view="issues"
    >
      <Stack gap="150">
        <Row wrap gap="150">
          <Container grow maxWidth="32rem" minWidth="18rem">
            <Row gap="100">
              <Container grow>
                <SearchInput
                  ariaLabel={t("search.aria")}
                  data-testid={InboxIssuesScreenTestId.Search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("search.placeholder")}
                  ref={searchRef}
                  value={search}
                />
              </Container>
              <Kbd>/</Kbd>
            </Row>
          </Container>
          <Container grow />
          <Row wrap gap="200">
            <ToggleField
              checked={groupByEpicOn}
              data-testid={InboxIssuesScreenTestId.GroupByEpic}
              label={t("toggle.groupByEpic")}
              onChange={setGroupByEpic}
              size="sm"
            />
            <ToggleField
              checked={showDone}
              data-testid={InboxIssuesScreenTestId.ShowDone}
              label={t("toggle.showDone")}
              onChange={setShowDone}
              size="sm"
            />
            <ToggleField
              checked={showHidden}
              data-testid={InboxIssuesScreenTestId.ShowHidden}
              label={t("toggle.showHidden", { n: pad2(hidden) })}
              onChange={setShowHidden}
              size="sm"
            />
          </Row>
        </Row>

        <Row wrap gap="150" justify="between">
          <Typography data-testid={InboxIssuesScreenTestId.Meta} type="label">
            {trimmed
              ? t("list.countMatch", { n: pad2(list.length), query: trimmed })
              : t("list.count", { n: pad2(list.length) })}
          </Typography>
          <Typography type="label">{t("list.sort")}</Typography>
        </Row>

        {list.length === 0 ? (
          <EmptyState
            action={
              showDone ? undefined : (
                <Button
                  data-testid={InboxIssuesScreenTestId.ShowDoneNow}
                  intent="secondary"
                  onClick={() => setShowDone(true)}
                  size="sm"
                >
                  {t("empty.showDone")}
                </Button>
              )
            }
            body={trimmed ? t("empty.bodySearch") : t("empty.body")}
            data-testid={InboxIssuesScreenTestId.Empty}
            title={t("empty.title")}
          />
        ) : groupByEpicOn ? (
          <EpicAccordion
            forceOpen={trimmed.length > 0}
            groups={groups}
            isProcessing={actions.isProcessing}
            now={now}
            onProcess={actions.process}
            onToggle={setOpenFlag}
            onToggleHidden={actions.toggleHidden}
            open={open}
            prs={prs}
            teamNames={teamNames}
          />
        ) : (
          <Stack gap="50">
            {list.map((item) => (
              <IssueRow
                item={item}
                key={item.id}
                now={now}
                onProcess={() => actions.process(item)}
                onToggleHidden={() => actions.toggleHidden(item)}
                pr={findPr(prs, linkedPrOf(item))}
                processing={actions.isProcessing(item)}
                teamName={item.teamId ? teamNames.get(item.teamId) : undefined}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </InboxPage>
  );
}
