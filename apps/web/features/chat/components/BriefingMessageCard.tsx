"use client";

import type { Briefing } from "@zibby/contracts";
import { Container, GlassSurface, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import {
  BriefingCardTestId,
  NeedsYouRow,
  SubsystemLineRow,
} from "../../overview/components/BriefingCard/BriefingCard";

export enum BriefingMessageCardTestId {
  Root = "chat-briefing-message-card",
}

/**
 * The butler briefing rendered as a chat transcript message (F8a, O6): the
 * headline, the needs-you rows (deep-linked to `/archiv`), the per-subsystem
 * lines, engagement rollups, and the did-for-you/watching/paused-limit counters —
 * the same content `BriefingCard` shows on `/overview`, reusing its row
 * sub-components (`NeedsYouRow`, `SubsystemLineRow`) rather than re-implementing
 * the layout (the brief's explicit instruction).
 *
 * Differs from `BriefingCard` in exactly the ways a transcript message must:
 * - `GlassSurface`, not `HudPanel` — this sits inside the conversation, not on a
 *   page, so it carries no title bar, no page-width assumption, no "Generate now"
 *   button (a past turn is a fixed snapshot of the briefing that was generated,
 *   not a live control surface).
 * - Bounded width to match the surrounding message column (`ChatMessage`'s own
 *   `maxWidth="68ch"` bubble), so a long-lived conversation doesn't get a
 *   full-bleed panel wedged between narrow bubbles.
 */
export function BriefingMessageCard({ briefing }: { briefing: Briefing }) {
  const t = useTranslations();
  const accent = !briefing.nothingNeedsYou;
  // Phase 9: the watching array mixes watched channels (integrationId) with runs
  // paused on the usage limit (summary) — count them separately so each line is
  // honest, same split `BriefingCard` uses.
  const watchingChannels = briefing.watching.filter((w) => w.integrationId).length;
  const pausedLimitRuns = briefing.watching.filter((w) => w.summary).length;

  return (
    <GlassSurface
      data-testid={BriefingMessageCardTestId.Root}
      radius="panel"
      style={{ maxWidth: "68ch" }}
    >
      <Container padding="200">
        <Stack gap="150">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Typography mono size="2xs" type="note" variant="tertiary">
              {t("overview.briefing")}
            </Typography>
            {accent && <StatusDot size="75" tone="accent" />}
          </Stack>

          <Typography
            data-testid={BriefingCardTestId.Headline}
            size="base"
            type="note"
            weight="medium"
          >
            {briefing.headline}
          </Typography>

          {briefing.needsYou.length > 0 && (
            <Stack gap="75">
              {briefing.needsYou.map((item) => (
                <NeedsYouRow item={item} key={item.id} />
              ))}
            </Stack>
          )}

          {briefing.subsystems && briefing.subsystems.length > 0 && (
            <Stack gap="50">
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("overview.briefingSubsystems")}
              </Typography>
              {briefing.subsystems.map((line) => (
                <SubsystemLineRow key={line.subsystem} line={line} />
              ))}
            </Stack>
          )}

          {briefing.engagements.length > 0 && (
            <Stack gap="50">
              {briefing.engagements.map((e) => (
                <Stack
                  align="center"
                  data-testid={BriefingCardTestId.Engagement}
                  direction="row"
                  gap="100"
                  justify="between"
                  key={e.projectId}
                >
                  <Typography mono truncate size="xs" type="note" variant="secondary">
                    {e.name}
                  </Typography>
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {t("overview.briefingEngagement", {
                      needs: e.needsYou,
                      did: e.didForYou,
                      queued: e.queued,
                      held: e.held,
                    })}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}

          <Stack wrap align="center" direction="row" gap="200">
            <Typography mono size="xs" type="note" variant="tertiary">
              {t("overview.briefingDid", { count: briefing.didForYou.length })}
            </Typography>
            {watchingChannels > 0 && (
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("overview.briefingWatching", { count: watchingChannels })}
              </Typography>
            )}
            {pausedLimitRuns > 0 && (
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("overview.briefingPausedLimit", { count: pausedLimitRuns })}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Container>
    </GlassSurface>
  );
}
