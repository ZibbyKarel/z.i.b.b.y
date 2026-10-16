"use client";

import { INBOX_PR_SECTIONS, type InboxPr } from "@zibby/contracts";
import { Button, Container, Panel, Row, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useNow } from "../../../hooks/useNow";
import { InboxPage } from "../components/InboxPage";
import { issueHref } from "../components/IssueRow";
import { PrActions } from "../components/PrActions";
import { PrRow } from "../components/PrRow";
import { groupPrsBySection, itemKey, linkedPrOf, pad2 } from "../inbox";
import { useInboxItemsQuery, useInboxPrsQuery } from "../queries";
import { useInboxFilters } from "../useInboxFilters";

export enum InboxPrsScreenTestId {
  Focus = "inbox-prs-focus",
  ShowAll = "inbox-prs-show-all",
  /** Suffixed with the section id: `inbox-prs-section-needs-your-review`. */
  Section = "inbox-prs-section",
  Footer = "inbox-prs-footer",
}

interface SectionProps {
  testId: string;
  title: string;
  note?: string;
  emptyText?: string;
  prs: InboxPr[];
  now: number;
  focus: string | null;
  itemFor: (pr: InboxPr) => { key: string; href: string } | undefined;
}

function PrSection({ testId, title, note, emptyText, prs, now, focus, itemFor }: SectionProps) {
  return (
    <Stack data-testid={testId} gap="100">
      <Row wrap gap="150">
        <Typography type="h3">{title}</Typography>
        <Typography type="label" variant="secondary">
          {pad2(prs.length)}
        </Typography>
        {note && (
          <Container grow textAlign="right">
            <Typography type="label">{note}</Typography>
          </Container>
        )}
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
            <PrRow
              actions={<PrActions pr={pr} />}
              focused={focus === pr.url}
              item={itemFor(pr)}
              key={pr.url}
              now={now}
              pr={pr}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * `/dashboard/inbox/pull-requests` — GitHub-style sections (Phase 129 P1, server-computed
 * `pr.section`, `INBOX_PR_SECTIONS` order), each sorted by blocker. Empty sections are
 * hidden except "Needs your review". Review / squash-and-merge are operator clicks
 * (`PrActions`). `?pr=<n>` focuses one PR (the link from an
 * issue's badge or the Overview); the list refetches every 15 min + on inbox-refresh activity.
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

  const sections = useMemo(
    () => groupPrsBySection(prsQuery.data?.prs ?? [], filters),
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
        {INBOX_PR_SECTIONS.map((section) => ({ section, prs: only(sections[section]) }))
          .filter(
            ({ section, prs }) => (section === "needs-your-review" && !focus) || prs.length > 0,
          )
          .map(({ section, prs }) => (
            <PrSection
              emptyText={t("prs.emptyToReview")}
              focus={focus}
              itemFor={(pr) => itemByPrUrl.get(pr.url)}
              key={section}
              note={t(`prs.sectionNote.${section}`)}
              now={now}
              prs={prs}
              testId={`${InboxPrsScreenTestId.Section}-${section}`}
              title={t(`prs.section.${section}`)}
            />
          ))}
        <Typography data-testid={InboxPrsScreenTestId.Footer} type="note" variant="secondary">
          {t("prs.footer")}
        </Typography>
      </Stack>
    </InboxPage>
  );
}
