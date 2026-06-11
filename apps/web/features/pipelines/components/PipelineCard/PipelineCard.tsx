import { Fragment } from "react"
import { useTranslations } from "next-intl"
import {
  Card,
  Chip,
  type ChipTone,
  Container,
  Divider,
  Icon,
  Stack,
  Typography,
} from "@zibby/design-system"
import type { Agent } from "@zibby/contracts"
import { type Pipeline, type PipelineState, glyphForAgent } from "../../../../domain"

const stateMeta = {
  done: { tone: "ok", pulse: false, labelKey: "stateDone" },
  parked: { tone: "wait", pulse: true, labelKey: "stateParked" },
  failed: { tone: "bad", pulse: false, labelKey: "stateFailed" },
  running: { tone: "run", pulse: true, labelKey: "stateRunning" },
} as const satisfies Record<
  PipelineState,
  { tone: ChipTone; pulse: boolean; labelKey: string }
>

export interface PipelineCardProps {
  pipeline: Pipeline
  agents: Agent[]
  selected: boolean
  onSelect: (id: string) => void
}

/** Master-list card for a pipeline: name, state, phase chips + last run. */
export function PipelineCard({ pipeline, agents, selected, onSelect }: PipelineCardProps) {
  const t = useTranslations("pipelines")
  const sm = stateMeta[pipeline.lastState]
  return (
    <Card
      aria-pressed={selected}
      as="button"
      interactive={!selected}
      onClick={() => onSelect(pipeline.id)}
      selected={selected}
    >
      <Container padding="150">
        <Stack gap="150">
          <Stack gap="75">
            <Stack align="center" direction="row" justify="between">
              <Typography mono size="md" type="note" weight="bold">
                {pipeline.name}
              </Typography>
              <Chip dot pulse={sm.pulse} tone={sm.tone}>
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
          <Stack align="center" direction="row" justify="end">
            <Typography mono size="xs" type="note" variant="tertiary">
              {t("cardLastRun", { lastRun: pipeline.lastRun })}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Card>
  )
}
