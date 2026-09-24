"use client";

import { Card, Container, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { type RunView, runTitle } from "../../runs/run";
import { formatRelativeTime } from "../statusFlyout";

export enum FlyoutErrorRowTestId {
  Root = "chat-flyout-error-row",
  Meta = "chat-flyout-error-row-meta",
  Title = "chat-flyout-error-row-title",
  Detail = "chat-flyout-error-row-detail",
}

export interface FlyoutErrorRowProps {
  /** The failed run's id — always known (from the subsystem's `errorRunIds`). */
  runId: string;
  /** The run from the feed; undefined when it has aged out of it (archived). */
  run: RunView | undefined;
  /** Display name of the subsystem that owns the failed run. */
  subsystemName: string;
}

/**
 * One failed run in the flyout's error section: subsystem + owner + relative
 * finish, the task title, and the recorded failure (`taskOutcomeSummary`). A run
 * id whose run already left the feed still renders — the count said it failed,
 * so the row must not silently vanish. Non-navigating, like FlyoutWorkRow.
 */
export function FlyoutErrorRow({ runId, run, subsystemName }: FlyoutErrorRowProps) {
  const locale = useLocale();
  const t = useTranslations("chat.statusPill.flyout.error");
  const finishedAt = run?.taskOutcomeFinishedAt ?? run?.startedAt;
  const detail = run == null ? t("missingRun") : run.taskOutcomeSummary?.trim() || t("noDetail");

  return (
    <Card background="background" data-testid={FlyoutErrorRowTestId.Root}>
      <Container padding="150">
        <Stack gap="100">
          <Stack
            align="center"
            data-testid={FlyoutErrorRowTestId.Meta}
            direction="row"
            gap="100"
            justify="between"
          >
            <Stack align="center" direction="row" gap="100">
              <StatusDot tone="bad" />
              <Typography
                mono
                uppercase
                size="xs"
                tracking="wide"
                type="note"
                variant="tertiary"
                weight="semibold"
              >
                {run ? `${subsystemName} · ${run.owner}` : subsystemName}
              </Typography>
            </Stack>
            {finishedAt != null && (
              <Typography mono size="xs" type="note" variant="tertiary">
                {formatRelativeTime(finishedAt, locale)}
              </Typography>
            )}
          </Stack>
          <Typography
            truncate
            data-testid={FlyoutErrorRowTestId.Title}
            size="sm"
            type="note"
            weight="semibold"
          >
            {run ? runTitle(run) : runId}
          </Typography>
          <Typography data-testid={FlyoutErrorRowTestId.Detail} size="xs" tone="bad" type="note">
            {detail}
          </Typography>
        </Stack>
      </Container>
    </Card>
  );
}
