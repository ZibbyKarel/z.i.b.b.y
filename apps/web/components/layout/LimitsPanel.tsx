"use client";

import { useTranslations } from "next-intl";
import {
  Container,
  Divider,
  Icon,
  Progress,
  type ProgressTone,
  Stack,
  Typography,
  usageTone,
} from "@zibby/design-system";
import { HudPanel } from "../HudPanel/HudPanel";
import { AGENT_SDK, CLAUDE_LIMITS } from "../../state/config";
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
        {t("limits.reset", { resetIn: t(d.resetIn), tokens: d.tokens })}
      </Typography>
    </Container>
  );
}

/**
 * The dashboard limits panel — interactive Claude limits as the headline,
 * with the Agent SDK credit as a secondary strip. Lives at the top of the
 * right rail (it moved out of the top bar).
 */
export function LimitsPanel() {
  const t = useTranslations();
  const { rolling, weekly } = CLAUDE_LIMITS;
  const sdk = AGENT_SDK;
  const sdkTone = usageTone(sdk.usedPct);

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

      <Divider />

      <Stack align="center" direction="row" gap="150">
        <Stack align="center" direction="row" gap="75" shrink={false}>
          <Icon name="dollar" size="sm" tone={asTone(sdkTone)} />
          <Typography
            mono
            uppercase
            leading="tight"
            size="2xs"
            style={{ whiteSpace: "pre-line" }}
            tracking="wide"
            type="note"
            variant="tertiary"
          >
            {t("limits.agentSdk")}
          </Typography>
        </Stack>
        <Container grow minW0>
          <Stack align="baseline" direction="row" gap="100" justify="between">
            <Typography mono nowrap size="caption" type="note" weight="bold">
              ${sdk.remaining}{" "}
              <Typography mono as="span" size="xs" type="note" variant="tertiary">
                / ${sdk.total}
              </Typography>
            </Typography>
            <Typography mono size="2xs" type="note" variant="tertiary">
              {t("limits.renew", { date: t(sdk.renew) })}
            </Typography>
          </Stack>
          <Container style={{ marginTop: "0.375rem" }}>
            <Progress glow height="50" label={t("limits.agentSdkCredit")} tone={sdkTone} value={sdk.usedPct} />
          </Container>
        </Container>
      </Stack>
    </HudPanel>
  );
}
