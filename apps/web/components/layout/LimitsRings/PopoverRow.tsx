"use client";
import type { LimitWindow } from "@zibby/contracts";
import { Icon, Progress, Stack, Typography, getUsageTone } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { MessageKey } from "../../../i18n/keys";
import { formatResetIn } from "./formatResetIn";

interface PopoverRowProps {
  label: MessageKey;
  window: LimitWindow;
  now: number;
}

export function PopoverRow({ label, window, now }: PopoverRowProps) {
  const t = useTranslations();
  const tone = getUsageTone(window.usedPct);
  const resetIn = formatResetIn(window.resetsAt, now);
  return (
    <Stack gap="75">
      <Stack align="baseline" direction="row" justify="between">
        <Typography type="label">{t(label)}</Typography>
        <Typography
          mono
          size="sm"
          tone={tone === "ok" ? undefined : tone}
          type="note"
          weight="semibold"
        >
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
