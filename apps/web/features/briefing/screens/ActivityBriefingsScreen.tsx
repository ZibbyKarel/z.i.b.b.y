"use client";

import { Button, Container, Panel, Stack, Tag, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { compactAgo } from "../../../utils/time";
import { DepartmentLineRow, NeedsYouRow } from "../components/BriefingRows";
import { useGenerateBriefingMutation } from "../mutations";
import { useBriefingQuery } from "../queries";

/**
 * `/activity/briefings` (ZB-07) — the assembled butler's briefing as a full
 * document (headline, needs-you, did-for-you, watching, per-department lines)
 * inside corner-bracketed `Panel`s, plus the "generate now" trigger.
 *
 * Read-aloud is named in the spec ("existing `useSpeech`") but no such hook
 * exists anywhere in the codebase (only speech-to-text, `useSpeechRecognition`,
 * for the chat mic) — nothing to wire up without inventing a feature from
 * scratch, so it's skipped here (see phase report).
 */
export function ActivityBriefingsScreen() {
  const t = useTranslations();
  const [now] = useState(() => Date.now());
  const { data: briefing, isPending, isError, refetch } = useBriefingQuery();
  const generate = useGenerateBriefingMutation();

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack wrap align="center" direction="row" gap="150" justify="between">
          <Stack wrap align="baseline" direction="row" gap="150">
            <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
              {t("activityBriefings.eyebrow")}
            </Typography>
            <Typography type="h1">{t("activityBriefings.title")}</Typography>
          </Stack>
          <Button disabled={generate.isPending} onClick={() => generate.mutate({ body: {} })}>
            {generate.isPending
              ? t("overview.briefingGenerate")
              : t("activityBriefings.generateNow")}
          </Button>
        </Stack>

        {isPending ? (
          <QueryLoading />
        ) : isError || !briefing ? (
          <QueryError onRetry={() => void refetch()} />
        ) : (
          <Stack gap="200">
            <Panel live header={t("activityBriefings.headline")}>
              <Container padding="200">
                <Stack gap="100">
                  <Typography type="h2">{briefing.headline}</Typography>
                  <Typography mono size="xs" type="note" variant="tertiary">
                    {t("activityBriefings.generatedAt", {
                      at: compactAgo(briefing.generatedAt, now),
                    })}
                  </Typography>
                </Stack>
              </Container>
            </Panel>

            <Panel header={t("activityBriefings.needsYou")}>
              <Container padding="200">
                {briefing.nothingNeedsYou || briefing.needsYou.length === 0 ? (
                  <Typography size="sm" type="note" variant="tertiary">
                    {t("activityBriefings.nothingNeedsYou")}
                  </Typography>
                ) : (
                  <Stack gap="100">
                    {briefing.needsYou.map((item, i) => (
                      <NeedsYouRow item={item} key={`${item.kind}-${item.id}-${i}`} />
                    ))}
                  </Stack>
                )}
              </Container>
            </Panel>

            <Panel header={t("activityBriefings.didForYou")}>
              <Container padding="200">
                {briefing.didForYou.length === 0 ? (
                  <Typography size="sm" type="note" variant="tertiary">
                    {t("activityBriefings.emptyDid")}
                  </Typography>
                ) : (
                  <Stack gap="75">
                    {briefing.didForYou.slice(0, 30).map((item, i) => (
                      <Typography
                        key={`${item.kind}-${i}`}
                        size="sm"
                        type="note"
                        variant="secondary"
                      >
                        {item.summary}
                      </Typography>
                    ))}
                  </Stack>
                )}
              </Container>
            </Panel>

            {briefing.departments && briefing.departments.length > 0 && (
              <Panel header={t("activityBriefings.departments")}>
                <Container padding="200">
                  <Stack gap="100">
                    {briefing.departments.map((line) => (
                      <DepartmentLineRow key={line.department} line={line} />
                    ))}
                  </Stack>
                </Container>
              </Panel>
            )}

            {briefing.watching.length > 0 && (
              <Panel header={t("activityBriefings.watching")}>
                <Container padding="200">
                  <Stack wrap direction="row" gap="75">
                    {briefing.watching.map((w, i) => (
                      <Tag key={`${w.integrationId ?? w.runRef}-${i}`} tone="neutral">
                        {w.summary ?? w.integrationId}
                      </Tag>
                    ))}
                  </Stack>
                </Container>
              </Panel>
            )}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
