"use client";

import { useTranslations } from "next-intl";
import {
  Container,
  Progress,
  type ProgressTone,
  Stack,
  Typography,
  usageTone,
} from "@zibby/design-system";
import { HudPanel } from "../HudPanel/HudPanel";
import { useLimitsQuery } from "../../features/limits/queries";
import { CLAUDE_LIMITS } from "../../state/config";
import type { QuotaLimit } from "../../domain";

type Tone = "ok" | "warn" | "bad" | "accent";
const asTone = (t: ProgressTone): Tone => t as Tone;

/** Per-CSS-var color for a tone — used for the subtle tinted block border. */
const toneVar: Record<Tone, string> = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  accent: "var(--color-accent)",
};

/** Prominent block for a single interactive limit (5h rolling / weekly). */
function LimitBlock({ d }: { d: QuotaLimit }) {
  const t = useTranslations();
  const tone = usageTone(d.usedPct);
  const color = toneVar[asTone(tone)];
  return (
    <Container
      grow
      minW0
      style={{
        flex: "1 1 0",
        padding: "13px 14px",
        background: "var(--color-background)",
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
        borderRadius: "var(--radius-sm)",
        boxShadow: `0 0 18px color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      <Typography mono nowrap uppercase size="xs" tracking="wide" type="note" variant="secondary">
        {t(d.label)}
      </Typography>
      <Stack align="baseline" direction="row" gap="25" style={{ marginTop: "0.5rem" }}>
        <Typography mono leading="tight" size="4xl" tone={asTone(tone)} type="note" weight="bold">
          {d.usedPct}
        </Typography>
        <Typography mono size="xl" tone={asTone(tone)} type="note" weight="bold">
          %
        </Typography>
      </Stack>
      <Container style={{ marginTop: "0.625rem" }}>
        <Progress glow height="75" label={t(d.label)} tone={tone} value={d.usedPct} />
      </Container>
      <Typography mono truncate size="2xs" style={{ marginTop: "0.45rem", display: "block" }} type="note" variant="tertiary">
        {t("limits.reset", { resetIn: t(d.resetIn), age: t(d.age) })}
      </Typography>
    </Container>
  );
}

/**
 * The dashboard limits panel — the interactive Claude limits (rolling 5h and
 * weekly), computed from real local usage and polled live. Lives at the top of
 * the right rail (it moved out of the top bar).
 */
export function LimitsPanel() {
  const t = useTranslations();
  // Before the first successful poll `data` is undefined; fall back to the static
  // zero-usage config so the panel always renders and never flashes empty.
  const { data } = useLimitsQuery();
  const rolling = data?.rolling ?? CLAUDE_LIMITS.rolling;
  const weekly = data?.weekly ?? CLAUDE_LIMITS.weekly;

  return (
    <HudPanel
      action={
        <Typography mono size="2xs" type="note" variant="tertiary">
          {t("limits.fromChat")}
        </Typography>
      }
      title={t("limits.panelTitle")}
    >
      <Stack direction="row" gap="100">
        <LimitBlock d={rolling} />
        <LimitBlock d={weekly} />
      </Stack>
    </HudPanel>
  );
}
