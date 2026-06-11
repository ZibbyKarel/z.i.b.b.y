import { Fragment } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  Container,
  Divider,
  Icon,
  IconTile,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { Agent } from "@zibby/contracts";
import { type Pipeline, type PipelinePhase, glyphForAgent } from "../../../domain";

/** Per-run model badge (opus / sonnet / haiku). */
export function ModelBadge({ model }: { model: PipelinePhase["model"] }) {
  const t = useTranslations("phase");
  return (
    <Tag title={t("modelTitle")} tone="neutral">
      {model}
    </Tag>
  );
}

/** Thinking-level badge (high / medium / low). */
export function ThinkBadge({ level }: { level: PipelinePhase["thinking"] }) {
  const t = useTranslations("phase");
  return (
    <Tag title={t("thinkTitle")} tone="neutral">
      ◇ {level}
    </Tag>
  );
}

function IoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Stack align="center" direction="row" gap="75">
      <Container shrink={false} width="30px">
        <Typography mono size="2xs" type="note" variant="tertiary">
          {label}
        </Typography>
      </Container>
      <Container grow minW0>
        <Typography
          mono
          truncate
          size="xs"
          tone={accent ? "accent" : undefined}
          type="note"
          variant={accent ? undefined : "secondary"}
        >
          {value}
        </Typography>
      </Container>
    </Stack>
  );
}

function PhaseNode({ phase, agents, idx, active }: { phase: PipelinePhase; agents: Agent[]; idx: number; active: boolean }) {
  const t = useTranslations("phase");
  return (
     
    <Card radius="default" selected={active} style={{ flex: "1 1 0%", minWidth: 0 }}>
      <Container padding="150">
        <Stack gap="100">
          <Stack align="center" direction="row" gap="100">
            <IconTile glyph={glyphForAgent(phase.agent, agents)} size="sm" />
            <Container minW0>
              <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                {t("phaseLabel", { n: idx + 1 })}
              </Typography>
              <Typography mono nowrap size="base" type="note" weight="semibold">
                {phase.agent}
              </Typography>
            </Container>
          </Stack>
          <Stack wrap direction="row" gap="75">
            <ModelBadge model={phase.model} />
            <ThinkBadge level={phase.thinking} />
          </Stack>
          <Divider />
          <Stack gap="75">
            <IoRow label={t("input")} value={phase.consumes} />
            <IoRow accent label={t("output")} value={phase.produces} />
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}

export interface PhaseChainProps {
  pipeline: Pipeline;
  agents: Agent[];
}

export function PhaseChain({ pipeline, agents }: PhaseChainProps) {
  const t = useTranslations("phase");
  const { phases } = pipeline;
  const loopPhase = phases.find((p) => p.loop);

  return (
    <Stack>
      {loopPhase?.loop && (
        <Container height="34px" position="relative">
          <svg
            aria-hidden
            preserveAspectRatio="none"
            // eslint-disable-next-line react/forbid-dom-props
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
            viewBox="0 0 100 34"
          >
            <path
              d="M62 30 C 62 6, 37 6, 37 30"
              fill="none"
              stroke="var(--color-bad)"
              strokeDasharray="3 3"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
            <path d="M37 30 l 2.6 -5 l -5.2 0 z" fill="var(--color-bad)" />
          </svg>
          { }
          <Container left="49.5%" position="absolute" style={{ transform: "translateX(-50%)" }} top="0">
            <Stack align="center" direction="row" gap="75">
              <Icon name="retry" size="xs" tone="bad" />
              <Typography mono size="xs" tone="bad" type="note">
                {t("retry", { n: loopPhase.loop.maxRetries })}
              </Typography>
            </Stack>
          </Container>
        </Container>
      )}
      <Stack align="stretch" direction="row" gap="25">
        {phases.map((ph, i) => (
          <Fragment key={`${ph.agent}-${i}`}>
            <PhaseNode active={Boolean(ph.loop)} agents={agents} idx={i} phase={ph} />
            {i < phases.length - 1 && (
               
              <Stack
                align="center"
                justify="center"
                shrink={false}
                style={{ alignSelf: "center" }}
              >
                <Container padding={["0", "50"]}>
                  <Stack align="center" gap="50">
                    <Typography mono nowrap size="2xs" type="note" variant="tertiary">
                      {phases[i + 1]!.consumes}
                    </Typography>
                    <Icon name="arrow" size="md" tone="faint" />
                  </Stack>
                </Container>
              </Stack>
            )}
          </Fragment>
        ))}
      </Stack>
    </Stack>
  );
}
