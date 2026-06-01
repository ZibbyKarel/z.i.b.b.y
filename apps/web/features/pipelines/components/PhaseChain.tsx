import { Fragment } from "react";
import {
  Card,
  Chip,
  Container,
  Divider,
  Icon,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import { glyphForAgent, type AgentDef, type Pipeline, type PipelinePhase } from "../../../domain";

const modelTone = {
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
} as const;

const thinkTone = {
  high: "think-high",
  medium: "think-medium",
  low: "think-low",
} as const;

/** Per-run model badge (opus / sonnet / haiku). */
export function ModelBadge({ model }: { model: PipelinePhase["model"] }) {
  return (
    <Chip tone={modelTone[model]} title="model (override per-run)">
      {model}
    </Chip>
  );
}

/** Thinking-level badge (high / medium / low). */
export function ThinkBadge({ level }: { level: PipelinePhase["thinking"] }) {
  return (
    <Chip tone={thinkTone[level]} title="thinking level">
      ◇ {level}
    </Chip>
  );
}

function IoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Stack direction="row" align="center" gap="75">
      <Container width="30px" shrink={false}>
        <Typography type="note" mono size="2xs" variant="tertiary">
          {label}
        </Typography>
      </Container>
      <Container grow minW0>
        <Typography
          type="note"
          mono
          size="xs"
          variant={accent ? undefined : "secondary"}
          tone={accent ? "accent" : undefined}
          truncate
        >
          {value}
        </Typography>
      </Container>
    </Stack>
  );
}

function PhaseNode({ phase, agents, idx, active }: { phase: PipelinePhase; agents: AgentDef[]; idx: number; active: boolean }) {
  return (
    <Card selected={active} radius="default" style={{ flex: "1 1 0%", minWidth: 0 }}>
      <Container padding="150">
        <Stack gap="100">
          <Stack direction="row" align="center" gap="100">
            <IconTile glyph={glyphForAgent(phase.agent, agents)} size="sm" />
            <Container minW0>
              <Typography type="note" mono size="2xs" tracking="wider" variant="tertiary">
                FÁZE {idx + 1}
              </Typography>
              <Typography type="note" mono size="base" weight="semibold" nowrap>
                {phase.agent}
              </Typography>
            </Container>
          </Stack>
          <Stack direction="row" wrap gap="75">
            <ModelBadge model={phase.model} />
            <ThinkBadge level={phase.thinking} />
          </Stack>
          <Divider />
          <Stack gap="75">
            <IoRow label="vstup" value={phase.consumes} />
            <IoRow label="výstup" value={phase.produces} accent />
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}

export interface PhaseChainProps {
  pipeline: Pipeline;
  agents: AgentDef[];
}

export function PhaseChain({ pipeline, agents }: PhaseChainProps) {
  const { phases } = pipeline;
  const loopPhase = phases.find((p) => p.loop);

  return (
    <Stack>
      {loopPhase?.loop && (
        <Container position="relative" height="34px">
          <svg
            viewBox="0 0 100 34"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
            aria-hidden
          >
            <path
              d="M62 30 C 62 6, 37 6, 37 30"
              fill="none"
              stroke="var(--color-bad)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <path d="M37 30 l 2.6 -5 l -5.2 0 z" fill="var(--color-bad)" />
          </svg>
          <Container position="absolute" left="49.5%" top="0" style={{ transform: "translateX(-50%)" }}>
            <Stack direction="row" align="center" gap="75">
              <Icon name="retry" size="xs" tone="bad" />
              <Typography type="note" mono size="xs" tone="bad">
                retry · max {loopPhase.loop.maxRetries}
              </Typography>
            </Stack>
          </Container>
        </Container>
      )}
      <Stack direction="row" align="stretch" gap="25">
        {phases.map((ph, i) => (
          <Fragment key={`${ph.agent}-${i}`}>
            <PhaseNode phase={ph} agents={agents} idx={i} active={Boolean(ph.loop)} />
            {i < phases.length - 1 && (
              <Stack
                align="center"
                justify="center"
                shrink={false}
                style={{ alignSelf: "center" }}
              >
                <Container padding={["0", "50"]}>
                  <Stack align="center" gap="50">
                    <Typography type="note" mono size="2xs" variant="tertiary" nowrap>
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
