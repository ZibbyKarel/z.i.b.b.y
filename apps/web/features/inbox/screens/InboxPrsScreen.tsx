"use client";

import { INBOX_PR_SECTIONS, type InboxPr } from "@zibby/contracts";
import {
  AccordionDetails,
  AccordionSummary,
  Container,
  EmptyState,
  Grid,
  Panel,
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
import { issueHref } from "../components/IssueRow";
import { useProjectsQuery } from "../../projects";
import { PrActions, hasPrActions } from "../components/PrActions";
import { PrDetail } from "../components/PrDetail";
import { PrRow } from "../components/PrRow";
import { groupPrsBySection, itemKey, linkedPrOf, pad2 } from "../inbox";
import { useInboxItemsQuery, useInboxPrsQuery } from "../queries";
import { useInboxFilters } from "../useInboxFilters";
import { useSessionFlags } from "../useSessionFlags";

const COLLAPSED_STORAGE_KEY = "zibby-inbox-pr-sections-collapsed";

export enum InboxPrsScreenTestId {
  /** Suffixed with the section id: `inbox-prs-section-needs-your-review`. */
  Section = "inbox-prs-section",
  Footer = "inbox-prs-footer",
  Detail = "inbox-prs-detail",
  Placeholder = "inbox-prs-detail-placeholder",
  Empty = "inbox-prs-empty",
}

interface SectionProps {
  testId: string;
  title: string;
  note?: string;
  prs: InboxPr[];
  now: number;
  focus: string | null;
  onSelect: (pr: InboxPr) => void;
  itemFor: (pr: InboxPr) => { key: string; href: string } | undefined;
  projectNames: Map<string, string>;
  expanded: boolean;
  onToggle?: () => void;
}

function PrSection({
  testId,
  title,
  note,
  prs,
  now,
  focus,
  onSelect,
  itemFor,
  projectNames,
  expanded,
  onToggle,
}: SectionProps) {
  return (
    <Stack data-testid={testId} gap="100">
      <AccordionSummary expanded={expanded} onToggle={onToggle}>
        <Row wrap as="span" gap="150">
          <Typography as="span" type="h3">
            {title}
          </Typography>
          <Typography as="span" type="label" variant="secondary">
            {pad2(prs.length)}
          </Typography>
          {note && (
            <Container grow as="span" textAlign="right">
              <Typography as="span" type="label">
                {note}
              </Typography>
            </Container>
          )}
        </Row>
      </AccordionSummary>
      <AccordionDetails expanded={expanded}>
        <Stack gap="100">
          {prs.map((pr) => (
            <PrRow
              actions={hasPrActions(pr) && focus !== pr.url ? <PrActions pr={pr} /> : undefined}
              focused={focus === pr.url}
              item={itemFor(pr)}
              key={pr.url}
              now={now}
              onSelect={onSelect}
              pr={pr}
              projectName={projectNames.get(pr.projectId)}
            />
          ))}
        </Stack>
      </AccordionDetails>
    </Stack>
  );
}

/**
 * `/dashboard/inbox/pull-requests` — master–detail. Left: GitHub-style sections (server-computed
 * `pr.section`, `INBOX_PR_SECTIONS` order) as a single column of cards, each sorted by blocker;
 * empty sections are hidden; with none left, an `EmptyState`. Right: the selected PR (`?pr=<url>`,
 * set by a card click, the issue badge link or the Overview) with its diff and the operator's
 * actions (`PrActions` — review / squash-and-merge). The list refetches every 15 min + on
 * inbox-refresh activity. Sections are collapsible accordions, expanded by default; collapse is
 * remembered per session (the selected PR's section always expands).
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

  // `?pr=<url>` (see `prListHref`) selects the PR shown on the right.
  const focus = searchParams.get("pr") || null;
  const sections = useMemo(
    () => groupPrsBySection(prsQuery.data?.prs ?? [], filters),
    [prsQuery.data, filters],
  );
  // Resolved from the rendered (filtered) sections, so a hidden PR shows the placeholder.
  const selected = focus
    ? INBOX_PR_SECTIONS.flatMap((s) => sections[s]).find((p) => p.url === focus)
    : undefined;

  const visibleSections = INBOX_PR_SECTIONS.filter((section) => sections[section].length > 0);

  const [collapsed, setCollapsed] = useSessionFlags(COLLAPSED_STORAGE_KEY);

  const itemByPrUrl = useMemo(() => {
    const map = new Map<string, { key: string; href: string }>();
    for (const item of itemsQuery.data?.items ?? []) {
      const ref = linkedPrOf(item);
      if (ref) map.set(ref.url, { key: itemKey(item), href: issueHref(item) });
    }
    return map;
  }, [itemsQuery.data]);

  const detailRef = useRef<HTMLElement>(null);

  const select = (url: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pr", url);
    router.replace(`${pathname}?${params.toString()}` as Route);
    // Below lg the detail stacks under the list — bring it into view (absent in jsdom).
    detailRef.current?.scrollIntoView?.({ block: "start" });
  };

  return (
    <InboxPage
      errors={[...(itemsQuery.data?.errors ?? []), ...(prsQuery.data?.errors ?? [])]}
      items={itemsQuery.data}
      status={prsQuery}
      view="prs"
    >
      <Grid align="start" gap="200" sidebar="left-narrow">
        <Container maxHeight="calc(100vh - 14rem)" overflowY="auto">
          <Stack gap="250">
            {visibleSections.length === 0 && (
              <EmptyState
                body={t("prs.emptyBody")}
                data-testid={InboxPrsScreenTestId.Empty}
                title={t("prs.emptyTitle")}
              />
            )}
            {visibleSections.map((section) => (
              <PrSection
                expanded={
                  collapsed[section] !== true || sections[section].some((p) => p.url === focus)
                }
                focus={focus}
                itemFor={(pr) => itemByPrUrl.get(pr.url)}
                key={section}
                note={t(`prs.sectionNote.${section}`)}
                now={now}
                onSelect={(pr) => select(pr.url)}
                onToggle={() => setCollapsed(section, collapsed[section] !== true)}
                projectNames={projectNames}
                prs={sections[section]}
                testId={`${InboxPrsScreenTestId.Section}-${section}`}
                title={t(`prs.section.${section}`)}
              />
            ))}
            <Typography data-testid={InboxPrsScreenTestId.Footer} type="note" variant="secondary">
              {t("prs.footer")}
            </Typography>
          </Stack>
        </Container>
        <Container aria-live="polite" data-testid={InboxPrsScreenTestId.Detail} ref={detailRef}>
          {selected ? (
            <PrDetail
              key={selected.url}
              now={now}
              pr={selected}
              projectName={projectNames.get(selected.projectId)}
            />
          ) : (
            <Panel
              data-testid={InboxPrsScreenTestId.Placeholder}
              padding={["200", "200"]}
              radius="none"
            >
              <Typography type="bodySm" variant="secondary">
                {t("prs.diff.select")}
              </Typography>
            </Panel>
          )}
        </Container>
      </Grid>
    </InboxPage>
  );
}
