"use client";

import type { InboxPr } from "@zibby/contracts";
import {
  Container,
  EmptyState,
  Grid,
  IndentRail,
  Row,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef } from "react";
import { useNow } from "../../../hooks/useNow";
import { InboxPage } from "../components/InboxPage";
import { useProjectsQuery } from "../../projects";
import { PrDetail } from "../components/PrDetail";
import { PrRow } from "../components/PrRow";
import { groupPrStacks, pad2, parentPr, passesFilters, prBaseLabel, prWaits } from "../inbox";
import { useInboxItemsQuery, useInboxPrsQuery } from "../queries";
import { useInboxFilters } from "../useInboxFilters";

/**
 * Height of the list + detail panes at lg+ — the page itself must not scroll there.
 * 24rem = everything in `<main>` outside the grid (app bar, page header, filter row,
 * page padding) plus the 72px dock padding, measured at 1440x900: 14rem left `<main>`
 * overflowing by 155px, hence +10rem. Re-measure if that chrome changes.
 */
const PRS_PANE_HEIGHT = "calc(100vh - 24rem)";

export enum InboxPrsScreenTestId {
  List = "inbox-prs-list",
  Count = "inbox-prs-count",
  /** Suffixed with the group root's number: `inbox-prs-group-12`. */
  Group = "inbox-prs-group",
  Detail = "inbox-prs-detail",
  Empty = "inbox-prs-empty",
}

/**
 * `/dashboard/inbox/pull-requests` — master–detail. Left: the visible PRs grouped by stack
 * (`groupPrStacks`): each group's root card, its stacked kids indented behind a rail; groups by
 * their most urgent member. Each card carries its state stripe, state line and action row
 * (`PrActions`). Right: the selected PR (`?pr=<url>`, else the first group's root) with its
 * diff. The list refetches every 15 min + on inbox-refresh activity.
 */
export function InboxPrsScreen() {
  const t = useTranslations("inboxPage");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow(60_000);
  const { filters } = useInboxFilters();
  const itemsQuery = useInboxItemsQuery();
  const prsQuery = useInboxPrsQuery();
  const { data: projects } = useProjectsQuery();
  const projectNames = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p.name])),
    [projects],
  );

  // Stack relations read the unfiltered list: a kid whose parent is filtered out still says
  // "ON #parent".
  const all = useMemo(() => prsQuery.data?.prs ?? [], [prsQuery.data]);
  const visible = useMemo(() => all.filter((p) => passesFilters(filters, p)), [all, filters]);
  const groups = useMemo(() => groupPrStacks(all, visible), [all, visible]);

  // `?pr=<url>` (see `prListHref`) resolves against the unfiltered list, so a link to a
  // filtered-out PR still opens; none or unknown → the first group's root. Computed, not
  // written to the URL.
  const focus = searchParams.get("pr") || null;
  const selected = (focus ? all.find((p) => p.url === focus) : undefined) ?? groups[0]?.root;

  const detailRef = useRef<HTMLElement>(null);

  const select = (url: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pr", url);
    router.replace(`${pathname}?${params.toString()}` as Route);
    // Below lg the detail stacks under the list — bring it into view (absent in jsdom).
    detailRef.current?.scrollIntoView?.({ block: "start" });
  };

  const card = (p: InboxPr) => (
    <PrRow
      baseLabel={prBaseLabel(p, all)}
      focused={p.url === selected?.url}
      key={p.url}
      now={now}
      onSelect={() => select(p.url)}
      parent={parentPr(p, all)}
      pr={p}
      projectName={projectNames.get(p.projectId)}
      waits={prWaits(p, all)}
    />
  );

  return (
    <InboxPage
      errors={[...(itemsQuery.data?.errors ?? []), ...(prsQuery.data?.errors ?? [])]}
      items={itemsQuery.data}
      status={prsQuery}
      view="prs"
    >
      <Grid gap="200" lgHeight={PRS_PANE_HEIGHT} sidebar="left-narrow">
        <Container overflowY="auto">
          <Stack data-testid={InboxPrsScreenTestId.List} gap="100">
            <Row justify="between">
              <Typography type="label">{t("prs.listTitle")}</Typography>
              <Typography data-testid={InboxPrsScreenTestId.Count} type="label">
                {pad2(visible.length)}
              </Typography>
            </Row>
            {groups.length === 0 && (
              <EmptyState
                body={t("prs.emptyBody")}
                data-testid={InboxPrsScreenTestId.Empty}
                title={t("prs.emptyTitle")}
              />
            )}
            <Stack gap="0">
              {groups.map((g) => (
                <Stack
                  data-testid={`${InboxPrsScreenTestId.Group}-${g.root.number}`}
                  gap="0"
                  key={g.root.url}
                >
                  {card(g.root)}
                  {g.kids.length > 0 && <IndentRail>{g.kids.map(card)}</IndentRail>}
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Container>
        <Stack minH0 aria-live="polite" data-testid={InboxPrsScreenTestId.Detail} ref={detailRef}>
          {selected && (
            <PrDetail
              key={selected.url}
              now={now}
              pr={selected}
              projectName={projectNames.get(selected.projectId)}
            />
          )}
        </Stack>
      </Grid>
    </InboxPage>
  );
}
