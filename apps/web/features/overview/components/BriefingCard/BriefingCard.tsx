"use client";

import type { Briefing, BriefingNeedsYouItem } from "@zibby/contracts";
import { Button, Container, Stack, Tag, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { HudPanel } from "../../../../components/HudPanel/HudPanel";
import { useGenerateBriefingMutation } from "../../mutations";
import { useBriefingQuery } from "../../queries";

export enum BriefingCardTestId {
  Root = "briefing-card",
  Headline = "briefing-headline",
  NeedsYouItem = "briefing-needs-you-item",
  Engagement = "briefing-engagement",
  Generate = "briefing-generate",
  Ready = "briefing-ready",
}

/** One "needs you" row: a kind chip + the summary, linking to where it's resolved
 *  (parked runs and approvals both surface on /runs). */
function NeedsYouRow({ item }: { item: BriefingNeedsYouItem }) {
  return (
    <Link data-testid={BriefingCardTestId.NeedsYouItem} href="/runs" style={{ display: "block" }}>
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

/**
 * The butler's briefing card (Phase 6.2, decision 14): the headline, the needs-you
 * list (deep-linked), a collapsed "did for you" count, the watching line, and a
 * calm "nothing needs you" state — styled accent only when something actually needs
 * the operator. A "generate now" button forces a fresh briefing on demand.
 */
export function BriefingCard() {
  const t = useTranslations();
  const { data: briefing } = useBriefingQuery();
  const generate = useGenerateBriefingMutation();

  if (!briefing) return null;
  const b: Briefing = briefing;
  const accent = !b.nothingNeedsYou;
  // Phase 9: the watching array mixes watched channels (integrationId) with runs
  // paused on the usage limit (summary) — count them separately so each line is honest.
  const watchingChannels = b.watching.filter((w) => w.integrationId).length;
  const pausedLimitRuns = b.watching.filter((w) => w.summary).length;

  return (
    <Container data-testid={BriefingCardTestId.Root}>
      <HudPanel
        action={
          <Stack align="center" direction="row" gap="100">
            {generate.isSuccess && (
              <Tag data-testid={BriefingCardTestId.Ready} tone="ok">
                {t("overview.briefingReady")}
              </Tag>
            )}
            <Button
              data-testid={BriefingCardTestId.Generate}
              icon="spark"
              intent="ghost"
              loading={generate.isPending}
              onClick={() => generate.mutate({ body: {} })}
              size="sm"
            >
              {t("overview.briefingGenerate")}
            </Button>
          </Stack>
        }
        title={t("overview.briefing")}
        tone={accent ? "accent" : undefined}
      >
        <Stack gap="150">
          <Typography
            data-testid={BriefingCardTestId.Headline}
            size="base"
            type="note"
            weight="medium"
          >
            {b.headline}
          </Typography>

          {b.needsYou.length > 0 && (
            <Stack gap="75">
              {b.needsYou.map((item) => (
                <NeedsYouRow item={item} key={item.id} />
              ))}
            </Stack>
          )}

          {b.engagements.length > 0 && (
            <Stack gap="50">
              {b.engagements.map((e) => (
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
              {t("overview.briefingDid", { count: b.didForYou.length })}
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
      </HudPanel>
    </Container>
  );
}
