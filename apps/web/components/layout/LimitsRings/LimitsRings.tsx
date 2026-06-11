"use client";

import { useState } from "react";
import type { LimitWindow, Limits } from "@zibby/contracts";
import {
  Card,
  Container,
  Divider,
  Icon,
  Pressable,
  Progress,
  ProgressRing,
  Stack,
  Typography,
  getUsageTone,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useLimitsQuery } from "../../../features/limits/queries";
import { useNow } from "../../../hooks/useNow";
import type { MessageKey } from "../../../i18n/keys";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../../../utils/time";

const CLAUDE_LIMITS: Limits = {
  rolling: { usedPct: 0, resetsAt: null },
  weekly: { usedPct: 0, resetsAt: null },
  capturedAt: null,
  stale: false,
};

/**
 * Format the time from `now` until `resetsAt` (both epoch ms) as a compact
 * `"6d 12h 4m"`, dropping any zero-valued part (so a sub-day span reads
 * `"12h 4m"` and a sub-hour span `"4m"`). Returns `null` when the reset is
 * unknown (`resetsAt == null`) or already elapsed — the caller then renders the
 * "unknown" copy instead. Locale-agnostic on purpose (bare numbers + d/h/m).
 */
export function formatResetIn(
  resetsAt: number | null,
  now: number,
): string | null {
  if (resetsAt == null) return null;
  const remaining = resetsAt - now;
  if (remaining <= 0) return null;
  const d = Math.floor(remaining / DAY_MS);
  const h = Math.floor((remaining % DAY_MS) / HOUR_MS);
  const m = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  // Always keep minutes when nothing larger survived, so we never render "".
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

/** Reset-countdown tick. */
const NOW_TICK_MS = 30_000;

function RingWithLabel({
  window,
  shortLabel,
  ariaLabel,
}: {
  window: LimitWindow;
  shortLabel: string;
  ariaLabel: string;
}) {
  return (
    <Stack align="center" direction="row" gap="75">
      <ProgressRing
        label={ariaLabel}
        tone={getUsageTone(window.usedPct)}
        value={window.usedPct}
      />
      <Typography type="micro">{shortLabel}</Typography>
    </Stack>
  );
}

/** One window's row inside the hover popover: label, bar, countdown. */
function PopoverRow({
  label,
  window,
  now,
}: {
  label: MessageKey;
  window: LimitWindow;
  now: number;
}) {
  const t = useTranslations();
  const tone = getUsageTone(window.usedPct);
  const resetIn = formatResetIn(window.resetsAt, now);
  return (
    <Stack gap="75">
      <Stack align="baseline" direction="row" justify="between">
        <Typography type="label">{t(label)}</Typography>
        <Typography mono size="sm" tone={tone === "ok" ? undefined : tone} type="note" weight="semibold">
          {window.usedPct}%
        </Typography>
      </Stack>
      <Progress label={t(label)} tone={tone} value={window.usedPct} />
      {resetIn && (
        <Stack align="center" direction="row" gap="25">
          <Icon name="retry" size="xs" tone="faint" />
          <Typography type="micro">{resetIn}</Typography>
        </Stack>
      )}
    </Stack>
  );
}

/**
 * The single home of the Claude limits: two circular gauges (rolling 5h ·
 * weekly) pinned to the top bar on every page, with the detail readout in a
 * hover/focus popover.
 */
export function LimitsRings() {
  const t = useTranslations();
  // Before the first successful poll `data` is undefined; fall back to the
  // static zero-usage config so the rings always render and never flash empty.
  const { data } = useLimitsQuery();
  const limits = data ?? CLAUDE_LIMITS;
  const now = useNow(NOW_TICK_MS);
  const [open, setOpen] = useState(false);

  return (
    <Container
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      position="relative"
    >
      <Pressable aria-expanded={open} aria-label={t("limits.panelTitle")}>
        <Container padding={["50", "150"]}>
          <Stack align="center" direction="row" gap="150">
            <RingWithLabel
              ariaLabel={t("limits.rollingLabel")}
              shortLabel={t("limits.rollingShort")}
              window={limits.rolling}
            />
            <Container height="20px">
              <Divider orientation="vertical" />
            </Container>
            <RingWithLabel
              ariaLabel={t("limits.weeklyLabel")}
              shortLabel={t("limits.weeklyShort")}
              window={limits.weekly}
            />
          </Stack>
        </Container>
      </Pressable>

      {open && (
        <Container position="absolute" right="0" top="100%" width="300px" zIndex={60}>
          <Card background="elevated" radius="lg" shadow="dropdown">
            <Container padding="200">
              <Stack gap="200">
                <Stack align="baseline" direction="row" justify="between">
                  <Typography type="label">{t("limits.panelTitle")}</Typography>
                  <Typography type="micro">{t("limits.fromChat")}</Typography>
                </Stack>
                <PopoverRow label="limits.rollingLabel" now={now} window={limits.rolling} />
                <PopoverRow label="limits.weeklyLabel" now={now} window={limits.weekly} />
              </Stack>
            </Container>
          </Card>
        </Container>
      )}
    </Container>
  );
}
