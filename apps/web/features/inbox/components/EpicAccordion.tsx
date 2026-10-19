"use client";

import type { InboxEpic, InboxPr, InboxRoadmapItem } from "@zibby/contracts";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Container,
  Progress,
  Row,
  Stack,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type EpicGroup, type IssueChain, findPr, linkedPrOf, newCount, pad2 } from "../inbox";
import { IssueRow } from "./IssueRow";
import { ExternalAnchor } from "./links";

export enum EpicAccordionTestId {
  Group = "inbox-epic-group",
  Source = "inbox-epic-source",
}

/** Accordion id of the trailing "No epic" section. */
export const NO_EPIC_ID = "__none";

export interface EpicAccordionProps {
  groups: EpicGroup[];
  prs: InboxPr[];
  now: number;
  teamNames: ReadonlyMap<string, string>;
  /** Expansion by epic id (remembered for the session by the screen). */
  open: Readonly<Record<string, boolean>>;
  /** A search expands every group that still has a match. */
  forceOpen: boolean;
  onToggle: (id: string, next: boolean) => void;
  isProcessing: (item: InboxRoadmapItem) => boolean;
  onProcess: (item: InboxRoadmapItem) => void;
  onToggleHidden: (item: InboxRoadmapItem) => void;
  /** todo-14 — blocking chain per item, resolved from the unfiltered list. */
  chainFor: (item: InboxRoadmapItem) => IssueChain | undefined;
}

function EpicHeader({ epic, items }: { epic: InboxEpic | null; items: InboxRoadmapItem[] }) {
  const t = useTranslations("inboxPage");
  const fresh = newCount(items);
  if (!epic) {
    return (
      <Typography type="body" weight="medium">
        {t("epic.none")}
      </Typography>
    );
  }
  const pct = epic.total > 0 ? Math.round((epic.done / epic.total) * 100) : 0;
  return (
    <Row gap="150">
      {epic.key && (
        <Typography mono size="xs" type="note" variant="secondary">
          {epic.key}
        </Typography>
      )}
      <Typography type="body" weight="medium">
        {epic.title}
      </Typography>
      <Tag uppercase tone="neutral">
        {t("epic.tag", { source: t(`source.${epic.source}`) })}
      </Tag>
      <Container width="8rem">
        <Progress
          height="25"
          label={t("epic.progress", { done: epic.done, total: epic.total })}
          value={pct}
        />
      </Container>
      <Typography mono size="2xs" type="note" variant="secondary">
        {pad2(epic.done)}/{pad2(epic.total)}
      </Typography>
      {fresh > 0 && <Typography type="label">{t("epic.newCount", { n: pad2(fresh) })}</Typography>}
    </Row>
  );
}

/**
 * "Group by epic" (spec decision 5/18): one collapsed-by-default `Accordion` panel
 * per epic with indented children, a final "No epic" panel, the epic's progress,
 * its new-in-source count and a link to the source. Expansion is controlled by
 * the screen so it survives the session.
 */
export function EpicAccordion({
  groups,
  prs,
  now,
  teamNames,
  open,
  forceOpen,
  onToggle,
  isProcessing,
  onProcess,
  onToggleHidden,
  chainFor,
}: EpicAccordionProps) {
  const t = useTranslations("inboxPage");
  return (
    <Accordion>
      {groups.map(({ epic, children }) => {
        const id = epic?.id ?? NO_EPIC_ID;
        const expanded = forceOpen || open[id] === true;
        return (
          <Stack data-testid={`${EpicAccordionTestId.Group}-${id}`} gap="0" key={id}>
            <Row gap="100">
              <Container grow minW0>
                <AccordionSummary expanded={expanded} onToggle={() => onToggle(id, !expanded)}>
                  <EpicHeader epic={epic} items={children} />
                </AccordionSummary>
              </Container>
              {epic?.url && (
                <TextLink
                  data-testid={`${EpicAccordionTestId.Source}-${id}`}
                  href={epic.url}
                  linkComponent={ExternalAnchor}
                >
                  <Typography type="label">{t("epic.source")}</Typography>
                </TextLink>
              )}
            </Row>
            <AccordionDetails expanded={expanded}>
              <Stack gap="50">
                {children.map((item) => (
                  <IssueRow
                    nested
                    chain={chainFor(item)}
                    item={item}
                    key={item.id}
                    now={now}
                    onProcess={() => onProcess(item)}
                    onToggleHidden={() => onToggleHidden(item)}
                    pr={findPr(prs, linkedPrOf(item))}
                    processing={isProcessing(item)}
                    teamName={item.teamId ? teamNames.get(item.teamId) : undefined}
                  />
                ))}
              </Stack>
            </AccordionDetails>
          </Stack>
        );
      })}
    </Accordion>
  );
}
