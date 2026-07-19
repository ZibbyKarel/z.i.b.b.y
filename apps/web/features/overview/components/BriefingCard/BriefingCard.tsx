"use client";

import type { Briefing } from "@zibby/contracts";
import { Button, Container, Stack, Tag, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../../components/HudPanel/HudPanel";
import { useGenerateBriefingMutation } from "../../../briefing/mutations";
import { useBriefingQuery } from "../../../briefing/queries";
import {
  BriefingCardTestId,
  NeedsYouRow,
  SubsystemLineRow,
} from "../../../briefing/components/BriefingRows";

/**
 * The butler's briefing card (Phase 6.2, decision 14): the headline, the needs-you
 * list (deep-linked), a collapsed "did for you" count, the watching line, and a
 * calm "nothing needs you" state — styled accent only when something actually needs
 * the operator. A "generate now" button forces a fresh briefing on demand.
 *
 * The row sub-components (`NeedsYouRow`, `SubsystemLineRow`) and `BriefingCardTestId`
 * moved to `features/briefing/components/BriefingRows` in F8c (D18) so `chat/
 * BriefingMessageCard` (F8a) can reuse them without importing from this page module.
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

          {b.subsystems && b.subsystems.length > 0 && (
            <Stack gap="50">
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("overview.briefingSubsystems")}
              </Typography>
              {b.subsystems.map((line) => (
                <SubsystemLineRow key={line.subsystem} line={line} />
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
