"use client";

import { useState } from "react";
import {
  Card,
  Container,
  Divider,
  Icon,
  Pressable,
  Progress,
  type ProgressTone,
  Sparkline,
  Stack,
  Typography,
  usageTone,
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
          <Typography mono size="xs" type="note" variant="tertiary">
            {label}
          </Typography>
          <Typography mono size="xs" tone={asTone(tone)} type="note" weight="bold">
            {pct}%
          </Typography>
        </Stack>
        <Progress glow height="50" tone={tone} value={pct} />
      </Stack>
    </Container>
  );
}

function LimitRow({ d }: { d: QuotaLimit }) {
  const tone = usageTone(d.usedPct);
  return (
    <Stack gap="50">
      <Stack align="baseline" direction="row" justify="between">
        <Typography mono size="sm" tracking="wide" type="note" variant="secondary">
          {d.label}
        </Typography>
        <Typography mono size="sm" tone={asTone(tone)} type="note" weight="semibold">
          {d.usedPct}%
        </Typography>
      </Stack>
      <Progress glow height="50" label={d.label} tone={tone} value={d.usedPct} />
      <Typography mono size="xs" type="note" variant="tertiary">
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
            <Stack align="center" direction="row" gap="150">
              <Stack align="center" direction="row" gap="100">
                <Typography
                  mono
                  uppercase
                  align="right"
                  leading="tight"
                  size="2xs"
                  tracking="wider"
                  type="note"
                  variant="tertiary"
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
              <Stack align="center" direction="row" gap="100">
                <Stack align="center" direction="row" gap="75">
                  <Icon name="dollar" size="sm" tone={asTone(sdkTone)} />
                  <Typography
                    mono
                    uppercase
                    leading="tight"
                    size="2xs"
                    tracking="wider"
                    type="note"
                    variant="tertiary"
                  >
                    agent
                    <br />
                    sdk
                  </Typography>
                </Stack>
                <Container width="96px">
                  <Stack gap="25">
                    <Stack align="baseline" direction="row" justify="between">
                      <Typography mono size="caption" type="note" weight="bold">
                        ${credit.remaining}
                      </Typography>
                      <Typography mono size="xs" type="note" variant="tertiary">
                        / ${credit.total}
                      </Typography>
                    </Stack>
                    <Progress glow height="50" tone={sdkTone} value={credit.usedPct} />
                  </Stack>
                </Container>
              </Stack>
              <Icon
                name="chevron"
                size="sm"
                style={{
                  transition: "transform 0.16s",
                  transform: open ? "rotate(90deg)" : undefined,
                }}
                tone="faint"
              />
            </Stack>
          </Container>
        </Card>
      </Pressable>

      {open && (
        <Container position="absolute" right="0" top="calc(100% + 8px)" width="360px" zIndex={50}>
          <Card animate="scale" background="raised" radius="sm" shadow="dropdown">
            <Container padding="250">
              <Stack gap="150">
                <Typography mono uppercase size="xs" tracking="widest" type="note" variant="tertiary">
                  Interaktivní limity · Claude Code
                </Typography>
                <Stack gap="150">
                  <LimitRow d={rolling} />
                  <LimitRow d={weekly} />
                </Stack>
                <Typography mono size="xs" type="note" variant="tertiary">
                  čerpá tvůj chat · nezávislé na agentech
                </Typography>
                <Divider />
                <Stack align="center" direction="row" justify="between">
                  <Typography mono uppercase size="xs" tone={asTone(sdkTone)} tracking="widest" type="note">
                    Agent SDK kredit
                  </Typography>
                  <Typography mono size="xs" type="note" variant="tertiary">
                    obnova {credit.renew}
                  </Typography>
                </Stack>
                <Stack align="baseline" direction="row" gap="100">
                  <Typography mono size="5xl" type="note" weight="bold">
                    ${credit.remaining}
                  </Typography>
                  <Typography mono size="base" type="note" variant="secondary">
                    zbývá z ${credit.total}
                  </Typography>
                </Stack>
                <Progress glow height="75" tone={sdkTone} value={credit.usedPct} />
                <Typography mono size="xs" type="note" variant="tertiary">
                  spotřebováno ${credit.used} · běhy agentů čerpají odsud
                </Typography>
                <Stack gap="75">
                  <Typography mono size="xs" tracking="wider" type="note" variant="tertiary">
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
