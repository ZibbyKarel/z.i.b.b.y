"use client";

import {
  Card,
  Container,
  Icon,
  type IconName,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useLocale } from "next-intl";
import { RUN_STATE, type RunView, runTitle } from "../../runs/run";
import { formatRelativeTime } from "../statusFlyout";

export enum FlyoutWorkRowTestId {
  Root = "chat-flyout-work-row",
  Meta = "chat-flyout-work-row-meta",
  Progress = "chat-flyout-work-row-progress",
}

export interface FlyoutWorkRowProps {
  run: RunView;
  /** Owner glyph resolved by the section (one useRunGlyphMap call, not per-row). */
  glyph: IconName;
}

/**
 * One live run in the flyout's working section (design VcWorkRow): a small bordered
 * card on the solid panel — state dot + owner + relative start, the task title, and
 * a mono work line (glyph + owner + optional pct). Non-navigating this phase (the
 * prototype's onOpenSys has no real target). Dot/pulse come from RUN_STATE (exhaustive
 * per-status map) — a RunView has no subsystem hue.
 */
export function FlyoutWorkRow({ run, glyph }: FlyoutWorkRowProps) {
  const locale = useLocale();
  const state = RUN_STATE[run.status];

  return (
    <Card background="background" data-testid={FlyoutWorkRowTestId.Root}>
      <Container padding="150">
        <Stack gap="100">
          <Stack
            align="center"
            data-testid={FlyoutWorkRowTestId.Meta}
            direction="row"
            gap="100"
            justify="between"
          >
            <Stack align="center" direction="row" gap="100">
              <StatusDot pulse={state.pulse} tone={state.dot} />
              <Typography
                mono
                uppercase
                size="xs"
                tracking="wide"
                type="note"
                variant="tertiary"
                weight="semibold"
              >
                {run.owner}
              </Typography>
            </Stack>
            <Typography mono size="xs" type="note" variant="tertiary">
              {formatRelativeTime(run.startedAt, locale)}
            </Typography>
          </Stack>

          <Typography truncate size="sm" type="note" weight="semibold">
            {runTitle(run)}
          </Typography>

          <Stack align="center" direction="row" gap="50">
            <Icon name={glyph} size="sm" />
            <Typography mono size="xs" tone="run" type="note">
              {run.owner}
              {run.pct != null && (
                <Typography
                  mono
                  as="span"
                  data-testid={FlyoutWorkRowTestId.Progress}
                  size="xs"
                  tone="run"
                  type="note"
                >
                  {` · ${run.pct}%`}
                </Typography>
              )}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
