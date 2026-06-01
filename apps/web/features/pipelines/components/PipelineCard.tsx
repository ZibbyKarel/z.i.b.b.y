import { Fragment } from "react"
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
import { glyphForAgent, type AgentDef, type Pipeline, type PipelineState } from "../../../domain"

const stateMeta: Record<PipelineState, { tone: "ok" | "warn" | "bad" | "accent"; label: string }> = {
  done: { tone: "ok", label: "hotovo" },
  parked: { tone: "warn", label: "zaparkováno" },
  failed: { tone: "bad", label: "selhalo" },
  running: { tone: "accent", label: "běží" },
}

export interface PipelineCardProps {
  pipeline: Pipeline
  agents: AgentDef[]
  selected: boolean
  onSelect: (id: string) => void
}

/** Master-list card for a pipeline: name, state, phase chips, budget + last run. */
export function PipelineCard({ pipeline, agents, selected, onSelect }: PipelineCardProps) {
  const sm = stateMeta[pipeline.lastState]
  return (
    <Card
      as="button"
      radius="sm"
      selected={selected}
      interactive={!selected}
      corners={selected}
      aria-pressed={selected}
      onClick={() => onSelect(pipeline.id)}
    >
      <Container padding="150">
        <Stack gap="150">
          <Stack gap="75">
            <Stack direction="row" align="center" justify="between">
              <Typography type="note" mono weight="bold" size="md">
                {pipeline.name}
              </Typography>
              <Chip tone={sm.tone}>
                <StatusDot tone={sm.tone} size="50" />
                {sm.label}
              </Chip>
            </Stack>
            <Typography type="note" variant="secondary" size="caption" leading="snug">
              {pipeline.desc}
            </Typography>
          </Stack>

          <Stack direction="row" wrap align="center" gap="75">
            {pipeline.phases.map((ph, i) => (
              <Fragment key={`${ph.agent}-${i}`}>
                <Stack direction="row" inline align="center" gap="50">
                  <Icon name={glyphForAgent(ph.agent, agents)} size="xs" tone="accent" />
                  <Typography type="note" mono size="xs" variant="secondary">
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
          <Stack direction="row" align="center" justify="between">
            <Stack direction="row" inline align="center" gap="50">
              <Icon name="dollar" size="xs" tone="faint" />
              <Typography type="note" mono size="xs" variant="tertiary">
                {`strop $${pipeline.budget}`}
              </Typography>
            </Stack>
            <Typography type="note" mono size="xs" variant="tertiary">
              poslední {pipeline.lastRun}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Card>
  )
}
