"use client";

import type {
  BriefingDepartmentLine,
  BriefingNeedsYouItem,
  DepartmentState,
} from "@zibby/contracts";
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
import { DEPARTMENT_GLYPH } from "../../departments/departmentVisuals";

export enum BriefingCardTestId {
  Root = "briefing-card",
  Headline = "briefing-headline",
  NeedsYouItem = "briefing-needs-you-item",
  Engagement = "briefing-engagement",
  Generate = "briefing-generate",
  Ready = "briefing-ready",
  /** One per-department grouping row (NS2 F3b). */
  DepartmentLine = "briefing-department-line",
}

/** Contract `DepartmentState` → DS dot tone for the compact department rows. */
export const STATE_DOT_TONE: Record<DepartmentState, DotTone> = {
  idle: "idle",
  running: "run",
  report: "ok",
  waiting: "wait",
  error: "bad",
};

/**
 * One compact department row (NS2 F3b): glyph + name + state dot + counts/note.
 * Shared by `overview/BriefingCard` (the page card) and `chat/BriefingMessageCard`
 * (F8a, the chat transcript variant) — relocated here in F8c (D18) so neither
 * imports from the other.
 */
export function DepartmentLineRow({ line }: { line: BriefingDepartmentLine }) {
  const t = useTranslations();
  const parts: string[] = [];
  if (line.tier3Count > 0)
    parts.push(t("overview.briefingDepartmentTier3", { count: line.tier3Count }));
  if (line.errorCount > 0)
    parts.push(t("overview.briefingDepartmentError", { count: line.errorCount }));
  if (line.tier2Count > 0)
    parts.push(t("overview.briefingDepartmentTier2", { count: line.tier2Count }));
  if (line.note) parts.push(line.note);
  return (
    <Stack
      align="center"
      data-testid={BriefingCardTestId.DepartmentLine}
      direction="row"
      gap="100"
      justify="between"
    >
      <Stack align="center" direction="row" gap="75">
        <StatusDot
          pulse={line.state === "waiting" || line.state === "error"}
          size="75"
          tone={STATE_DOT_TONE[line.state]}
        />
        <Icon name={DEPARTMENT_GLYPH[line.department]} size="xs" tone="faint" />
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
 * Parked runs and approvals both surface on the run archive — `/archiv` (F2) is
 * now `/activity/runs` (ZB-07, ROUTE-MAP §2). Shared by `chat/BriefingMessageCard`
 * (D18) — relocated here in F8c so it and the (now-deleted, F8d) `overview/BriefingCard`
 * didn't import from each other.
 */
export function NeedsYouRow({ item }: { item: BriefingNeedsYouItem }) {
  return (
    <Link
      data-testid={BriefingCardTestId.NeedsYouItem}
      href="/activity/runs"
      style={{ display: "block" }}
    >
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
