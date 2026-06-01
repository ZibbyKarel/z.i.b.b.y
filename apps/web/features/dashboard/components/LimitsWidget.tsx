"use client";

import { useState } from "react";
import {
  Card,
  Container,
  Divider,
  Icon,
  Pressable,
  Progress,
  usageTone,
  Sparkline,
  Stack,
  Typography,
  type ProgressTone,
} from "@zibby/design-system";
import type { AgentSdkCredit, ClaudeLimits, QuotaLimit } from "../../../domain";

type Tone = "ok" | "warn" | "bad" | "accent";
const asTone = (t: ProgressTone): Tone => t as Tone;

function MiniBar({ label, pct, width }: { label: string; pct: number; width: number }) {
  const tone = usageTone(pct);
  return (
    <Container width={`${width}px`}>
      <Stack gap="25">
        <Stack direction="row" justify="between">
          <Typography type="note" mono size="xs" variant="tertiary">
            {label}
          </Typography>
          <Typography type="note" mono size="xs" weight="bold" tone={asTone(tone)}>
            {pct}%
          </Typography>
        </Stack>
        <Progress value={pct} tone={tone} height="50" glow />
      </Stack>
    </Container>
  );
}

function LimitRow({ d }: { d: QuotaLimit }) {
  const tone = usageTone(d.usedPct);
  return (
    <Stack gap="50">
      <Stack direction="row" align="baseline" justify="between">
        <Typography type="note" mono size="sm" tracking="wide" variant="secondary">
          {d.label}
        </Typography>
        <Typography type="note" mono size="sm" weight="semibold" tone={asTone(tone)}>
          {d.usedPct}%
        </Typography>
      </Stack>
      <Progress value={d.usedPct} tone={tone} height="50" glow label={d.label} />
      <Typography type="note" mono size="xs" variant="tertiary">
        reset {d.resetIn} · {d.tokens}
      </Typography>
    </Stack>
  );
}

export interface LimitsWidgetProps {
  limits: ClaudeLimits;
  credit: AgentSdkCredit;
}

export function LimitsWidget({ limits, credit }: LimitsWidgetProps) {
  const [open, setOpen] = useState(false);
  const { rolling, weekly } = limits;
  const sdkTone = usageTone(credit.usedPct);

  return (
    <Container position="relative">
      <Pressable
        aria-expanded={open}
        aria-label="Claude Code limits and Agent SDK credit"
        onClick={() => setOpen((v) => !v)}
      >
        <Card background="background" radius="sm">
          <Container padding={["100", "150"]}>
            <Stack direction="row" align="center" gap="150">
              <Stack direction="row" align="center" gap="100">
                <Typography
                  type="note"
                  mono
                  size="2xs"
                  uppercase
                  tracking="wider"
                  variant="tertiary"
                  leading="tight"
                  align="right"
                >
                  inter-
                  <br />
                  aktivní
                </Typography>
                <MiniBar label="5h" pct={rolling.usedPct} width={62} />
                <MiniBar label="týden" pct={weekly.usedPct} width={62} />
              </Stack>
              <Container height="28px">
                <Divider orientation="vertical" />
              </Container>
              <Stack direction="row" align="center" gap="100">
                <Stack direction="row" align="center" gap="75">
                  <Icon name="dollar" size="sm" tone={asTone(sdkTone)} />
                  <Typography
                    type="note"
                    mono
                    size="2xs"
                    uppercase
                    tracking="wider"
                    variant="tertiary"
                    leading="tight"
                  >
                    agent
                    <br />
                    sdk
                  </Typography>
                </Stack>
                <Container width="96px">
                  <Stack gap="25">
                    <Stack direction="row" align="baseline" justify="between">
                      <Typography type="note" mono size="caption" weight="bold">
                        ${credit.remaining}
                      </Typography>
                      <Typography type="note" mono size="xs" variant="tertiary">
                        / ${credit.total}
                      </Typography>
                    </Stack>
                    <Progress value={credit.usedPct} tone={sdkTone} height="50" glow />
                  </Stack>
                </Container>
              </Stack>
              <Icon
                name="chevron"
                size="sm"
                tone="faint"
                style={{
                  transition: "transform 0.16s",
                  transform: open ? "rotate(90deg)" : undefined,
                }}
              />
            </Stack>
          </Container>
        </Card>
      </Pressable>

      {open && (
        <Container position="absolute" top="calc(100% + 8px)" right="0" zIndex={50} width="360px">
          <Card background="raised" radius="sm" shadow="dropdown" animate="scale">
            <Container padding="250">
              <Stack gap="150">
                <Typography type="note" mono size="xs" uppercase tracking="widest" variant="tertiary">
                  Interaktivní limity · Claude Code
                </Typography>
                <Stack gap="150">
                  <LimitRow d={rolling} />
                  <LimitRow d={weekly} />
                </Stack>
                <Typography type="note" mono size="xs" variant="tertiary">
                  čerpá tvůj chat · nezávislé na agentech
                </Typography>
                <Divider />
                <Stack direction="row" align="center" justify="between">
                  <Typography type="note" mono size="xs" uppercase tracking="widest" tone={asTone(sdkTone)}>
                    Agent SDK kredit
                  </Typography>
                  <Typography type="note" mono size="xs" variant="tertiary">
                    obnova {credit.renew}
                  </Typography>
                </Stack>
                <Stack direction="row" align="baseline" gap="100">
                  <Typography type="note" mono size="5xl" weight="bold">
                    ${credit.remaining}
                  </Typography>
                  <Typography type="note" mono size="base" variant="secondary">
                    zbývá z ${credit.total}
                  </Typography>
                </Stack>
                <Progress value={credit.usedPct} tone={sdkTone} height="75" glow />
                <Typography type="note" mono size="xs" variant="tertiary">
                  spotřebováno ${credit.used} · běhy agentů čerpají odsud
                </Typography>
                <Stack gap="75">
                  <Typography type="note" mono size="xs" tracking="wider" variant="tertiary">
                    TREND 14 DNÍ ($/den)
                  </Typography>
                  <Sparkline data={credit.trend} />
                </Stack>
              </Stack>
            </Container>
          </Card>
        </Container>
      )}
    </Container>
  );
}
