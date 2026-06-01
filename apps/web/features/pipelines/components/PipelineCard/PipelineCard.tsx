import { Fragment } from "react"
import { useTranslations } from "next-intl"
import {
  Card,
  Chip,
  Container,
  Divider,
  Icon,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system"
import { type AgentDef, type Pipeline, type PipelineState, glyphForAgent } from "../../../../domain"

const stateMeta: Record<PipelineState, { tone: "ok" | "warn" | "bad" | "accent"; labelKey: string }> = {
  done: { tone: "ok", labelKey: "stateDone" },
  parked: { tone: "warn", labelKey: "stateParked" },
  failed: { tone: "bad", labelKey: "stateFailed" },
  running: { tone: "accent", labelKey: "stateRunning" },
}

export interface PipelineCardProps {
  pipeline: Pipeline
  agents: AgentDef[]
  selected: boolean
  onSelect: (id: string) => void
}

/** Master-list card for a pipeline: name, state, phase chips, budget + last run. */
export function PipelineCard({ pipeline, agents, selected, onSelect }: PipelineCardProps) {
  const t = useTranslations("pipelines")
  const sm = stateMeta[pipeline.lastState]
  return (
    <Card
      aria-pressed={selected}
      as="button"
      corners={selected}
      interactive={!selected}
      onClick={() => onSelect(pipeline.id)}
      radius="sm"
      selected={selected}
    >
      <Container padding="150">
        <Stack gap="150">
          <Stack gap="75">
            <Stack align="center" direction="row" justify="between">
              <Typography mono size="md" type="note" weight="bold">
                {pipeline.name}
              </Typography>
              <Chip tone={sm.tone}>
                <StatusDot size="50" tone={sm.tone} />
                {t(sm.labelKey)}
              </Chip>
            </Stack>
            <Typography leading="snug" size="caption" type="note" variant="secondary">
              {pipeline.desc}
            </Typography>
          </Stack>

          <Stack wrap align="center" direction="row" gap="75">
            {pipeline.phases.map((ph, i) => (
              <Fragment key={`${ph.agent}-${i}`}>
                <Stack inline align="center" direction="row" gap="50">
                  <Icon name={glyphForAgent(ph.agent, agents)} size="xs" tone="accent" />
                  <Typography mono size="xs" type="note" variant="secondary">
                    {ph.agent}
                  </Typography>
                </Stack>
                {i < pipeline.phases.length - 1 && (
                  <Icon name="arrow" size="xs" tone="faint" />
                )}
              </Fragment>
            ))}
          </Stack>

          <Divider />
          <Stack align="center" direction="row" justify="between">
            <Stack inline align="center" direction="row" gap="50">
              <Icon name="dollar" size="xs" tone="faint" />
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("cardBudget", { budget: pipeline.budget })}
              </Typography>
            </Stack>
            <Typography mono size="xs" type="note" variant="tertiary">
              {t("cardLastRun", { lastRun: pipeline.lastRun })}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Card>
  )
}
