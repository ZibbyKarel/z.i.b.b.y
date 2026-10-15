"use client";

import type { InboxPr } from "@zibby/contracts";
import { Button, Container, Panel, Row, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { InboxPage } from "../components/InboxPage";
import { issueHref } from "../components/IssueRow";
import { PrRow } from "../components/PrRow";
import { itemKey, linkedPrOf, pad2, splitPrs } from "../inbox";
import { useInboxItemsQuery, useInboxPrsQuery } from "../queries";
import { useInboxFilters } from "../useInboxFilters";

export enum InboxPrsScreenTestId {
  Focus = "inbox-prs-focus",
  ShowAll = "inbox-prs-show-all",
  ToReview = "inbox-prs-to-review",
  Mine = "inbox-prs-mine",
  Footer = "inbox-prs-footer",
}

interface SectionProps {
  testId: string;
  index: string;
  title: string;
  note: string;
  emptyText: string;
  prs: InboxPr[];
  now: number;
  focus: string | null;
  itemFor: (pr: InboxPr) => { key: string; href: string } | undefined;
}

function PrSection({
  testId,
  index,
  title,
  note,
  emptyText,
  prs,
  now,
  focus,
  itemFor,
}: SectionProps) {
  return (
    <Stack data-testid={testId} gap="100">
      <Row wrap gap="150">
        <Typography type="label">{index}</Typography>
        <Typography type="h3">{title}</Typography>
        <Typography type="label" variant="secondary">
          {pad2(prs.length)}
        </Typography>
        <Container grow textAlign="right">
          <Typography type="label">{note}</Typography>
        </Container>
      </Row>
      {prs.length === 0 ? (
        <Panel padding={["200", "200"]} radius="none">
          <Typography type="bodySm" variant="secondary">
            {emptyText}
          </Typography>
        </Panel>
      ) : (
        <Stack gap="50">
          {prs.map((pr) => (
            <PrRow focused={focus === pr.url} item={itemFor(pr)} key={pr.url} now={now} pr={pr} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * `/inbox/pull-requests` — two sections, "To review" and "Mine — push to merged",
 * each sorted by blocker. Read-only. `?pr=<n>` focuses one PR (the link from an
 * issue's badge or the Overview); the list refetches on focus and every 60 s.
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

  // `?pr=<url>` (see `prListHref`); the number is only for the banner label.
  const focus = searchParams.get("pr") || null;
  const focusNumber = focus?.match(/\/pull\/(\d+)/)?.[1] ?? focus;

  const { toReview, mine } = useMemo(
    () => splitPrs(prsQuery.data?.prs ?? [], filters),
    [prsQuery.data, filters],
  );
  const only = (prs: InboxPr[]) => (focus ? prs.filter((pr) => pr.url === focus) : prs);

  const itemByPrUrl = useMemo(() => {
    const map = new Map<string, { key: string; href: string }>();
    for (const item of itemsQuery.data?.items ?? []) {
      const ref = linkedPrOf(item);
      if (ref) map.set(ref.url, { key: itemKey(item), href: issueHref(item) });
    }
    return map;
  }, [itemsQuery.data]);

  const clearFocus = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("pr");
    const qs = params.toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route);
  };

  return (
    <InboxPage
      errors={[...(itemsQuery.data?.errors ?? []), ...(prsQuery.data?.errors ?? [])]}
      items={itemsQuery.data}
      status={prsQuery}
      view="prs"
    >
      <Stack gap="250">
        {focus && (
          <Panel
            borderTone="ink"
            data-testid={InboxPrsScreenTestId.Focus}
            padding={["75", "150"]}
            radius="none"
          >
            <Row gap="150">
              <Typography type="label" variant="primary">
                {t("prs.focus", { n: focusNumber ?? "" })}
              </Typography>
              <Container grow textAlign="right">
                <Button
                  data-testid={InboxPrsScreenTestId.ShowAll}
                  intent="ghost"
                  onClick={clearFocus}
                  size="sm"
                >
                  {t("prs.showAll")}
                </Button>
              </Container>
            </Row>
          </Panel>
        )}
        <PrSection
          emptyText={t("prs.emptyToReview")}
          focus={focus}
          index="01 —"
          itemFor={(pr) => itemByPrUrl.get(pr.url)}
          note={t("prs.toReviewNote")}
          now={now}
          prs={only(toReview)}
          testId={InboxPrsScreenTestId.ToReview}
          title={t("prs.toReview")}
        />
        <PrSection
          emptyText={t("prs.emptyMine")}
          focus={focus}
          index="02 —"
          itemFor={(pr) => itemByPrUrl.get(pr.url)}
          note={t("prs.mineNote")}
          now={now}
          prs={only(mine)}
          testId={InboxPrsScreenTestId.Mine}
          title={t("prs.mineTitle")}
        />
        <Typography data-testid={InboxPrsScreenTestId.Footer} type="note" variant="secondary">
          {t("prs.footer")}
        </Typography>
      </Stack>
    </InboxPage>
  );
}
