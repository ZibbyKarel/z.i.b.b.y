"use client";

import type { Limits } from "@zibby/contracts";
import { Card, Container, Divider, Pressable, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useLimitsQuery } from "../../../features/limits/queries";
import { useNow } from "../../../hooks/useNow";
import { PopoverRow } from "./PopoverRow";
import { RingWithLabel } from "./RingWithLabel";

interface LimitsRingsProps {
  showTitles?: boolean;
}
export { formatResetIn } from "./formatResetIn";

const CLAUDE_LIMITS: Limits = {
  rolling: { usedPct: 0, resetsAt: null },
  weekly: { usedPct: 0, resetsAt: null },
  capturedAt: null,
  stale: false,
};

/** Reset-countdown tick. */
const NOW_TICK_MS = 30_000;

/**
 * The single home of the Claude limits: two circular gauges (rolling 5h ·
 * weekly) pinned to the top bar on every page, with the detail readout in a
 * hover/focus popover.
 */
export function LimitsRings({ showTitles }: LimitsRingsProps) {
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
              showTitle={showTitles}
              window={limits.rolling}
            />
            <Container height="20px">
              <Divider orientation="vertical" />
            </Container>
            <RingWithLabel
              ariaLabel={t("limits.weeklyLabel")}
              shortLabel={t("limits.weeklyShort")}
              showTitle={showTitles}
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
