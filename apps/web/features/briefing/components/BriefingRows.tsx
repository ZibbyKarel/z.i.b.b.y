"use client";

import type { BriefingNeedsYouItem, BriefingSubsystemLine, SubsystemState } from "@zibby/contracts";
import {
  Container,
  type DotTone,
  Icon,
  Stack,
  StatusDot,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { SUBSYSTEM_GLYPH } from "../../subsystems/subsystemVisuals";

export enum BriefingCardTestId {
  Root = "briefing-card",
  Headline = "briefing-headline",
  NeedsYouItem = "briefing-needs-you-item",
  Engagement = "briefing-engagement",
  Generate = "briefing-generate",
  Ready = "briefing-ready",
  /** One per-subsystem grouping row (NS2 F3b). */
  SubsystemLine = "briefing-subsystem-line",
}

/** Contract `SubsystemState` → DS dot tone for the compact subsystem rows. */
export const STATE_DOT_TONE: Record<SubsystemState, DotTone> = {
  idle: "idle",
  running: "run",
  report: "ok",
  waiting: "wait",
};

/**
 * One compact subsystem row (NS2 F3b): glyph + name + state dot + counts/note.
 * Shared by `overview/BriefingCard` (the page card) and `chat/BriefingMessageCard`
 * (F8a, the chat transcript variant) — relocated here in F8c (D18) so neither
 * imports from the other.
 */
export function SubsystemLineRow({ line }: { line: BriefingSubsystemLine }) {
  const t = useTranslations();
  const parts: string[] = [];
  if (line.tier3Count > 0)
    parts.push(t("overview.briefingSubsystemTier3", { count: line.tier3Count }));
  if (line.tier2Count > 0)
    parts.push(t("overview.briefingSubsystemTier2", { count: line.tier2Count }));
  if (line.note) parts.push(line.note);
  return (
    <Stack
      align="center"
      data-testid={BriefingCardTestId.SubsystemLine}
      direction="row"
      gap="100"
      justify="between"
    >
      <Stack align="center" direction="row" gap="75">
        <StatusDot pulse={line.state === "waiting"} size="75" tone={STATE_DOT_TONE[line.state]} />
        <Icon name={SUBSYSTEM_GLYPH[line.subsystem]} size="xs" tone="faint" />
        <Typography mono size="xs" type="note" variant="secondary">
          {line.name}
        </Typography>
      </Stack>
      {parts.length > 0 && (
        <Typography mono truncate size="2xs" type="note" variant="tertiary">
          {parts.join(" · ")}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * One "needs you" row: a kind chip + the summary, linking to where it's resolved.
 * Parked runs and approvals both surface on the archive of tasks (F8a repoint —
 * `/runs` is deleted in F8c and `/archiv` replaced it in F2). Shared by
 * `overview/BriefingCard` and `chat/BriefingMessageCard` (D18) — relocated here in
 * F8c so neither imports from the other.
 */
export function NeedsYouRow({ item }: { item: BriefingNeedsYouItem }) {
  return (
    <Link data-testid={BriefingCardTestId.NeedsYouItem} href="/archiv" style={{ display: "block" }}>
      <Stack align="center" direction="row" gap="100">
        <Tag tone={item.kind === "approval" ? "warn" : "neutral"}>{item.kind}</Tag>
        <Container grow minW0>
          <Typography truncate size="sm" type="note" variant="secondary">
            {item.summary}
          </Typography>
        </Container>
      </Stack>
    </Link>
  );
}
