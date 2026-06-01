"use client";
import { Fragment, useState } from "react"
import {
  Button,
  Card,
  Container,
  Dialog,
  Divider,
  Grid,
  Icon,
  IconTile,
  Pressable,
  SegmentedField,
  Stack,
  Typography,
  TextAreaField,
} from "@zibby/design-system"
import { glyphForAgent, type AgentDef, type ModelName, type Pipeline, type ThinkingLevel } from "../../../domain"
import { ModelBadge, ThinkBadge } from "./PhaseChain"

const CYCLE_MODEL: ModelName[] = ["opus", "sonnet", "haiku"]
const CYCLE_THINK: ThinkingLevel[] = ["high", "medium", "low"]
const next = <T,>(arr: T[], v: T): T => arr[(arr.indexOf(v) + 1) % arr.length]!

interface Override {
  model: ModelName
  thinking: ThinkingLevel
}

export interface PipelineRunModalProps {
  pipeline: Pipeline
  agents: AgentDef[]
  projects: string[]
  onClose: () => void
  onLaunch?: (req: {
    pipeline: Pipeline
    prompt: string
    project: string
    budget: number
    overrides: Override[]
  }) => void
}

/**
 * Launch modal for a multi-agent pipeline: prompt, target project, budget cap
 * and per-agent model / thinking overrides (clickable badges). Mount with a
 * `key={pipeline.id}` so state initialises against the selected pipeline.
 */
export function PipelineRunModal({
  pipeline,
  agents,
  projects,
  onClose,
  onLaunch,
}: PipelineRunModalProps) {
  const [prompt, setPrompt] = useState("")
  const [project, setProject] = useState(projects[0] ?? "")
  const [budget, setBudget] = useState(pipeline.budget)
  const [overrides, setOverrides] = useState<Override[]>(
    pipeline.phases.map((p) => ({ model: p.model, thinking: p.thinking })),
  )
  const [launched, setLaunched] = useState(false)

  function cycleModel(i: number) {
    setOverrides((o) => o.map((x, j) => (j === i ? { ...x, model: next(CYCLE_MODEL, x.model) } : x)))
  }
  function cycleThink(i: number) {
    setOverrides((o) =>
      o.map((x, j) => (j === i ? { ...x, thinking: next(CYCLE_THINK, x.thinking) } : x)),
    )
  }

  return (
    <Dialog
      open
      width="lg"
      onClose={onClose}
      ariaLabel={`Spustit pipeline ${pipeline.name}`}
      closeLabel="Zavřít"
      title={
        <Stack direction="row" align="center" gap="150">
          <IconTile glyph="flow" size="md" />
          <Container grow minW0>
            <Typography type="note" mono weight="bold" size="xl">
              Spustit · {pipeline.name}
            </Typography>
            <Typography type="note" variant="secondary" size="base">
              {pipeline.phases.length} fází · víceagentní běh na pozadí
            </Typography>
          </Container>
        </Stack>
      }
      actions={
        launched ? undefined : (
          <Stack direction="row" align="center" justify="between" grow>
            <Button intent="ghost" icon="edit">
              Edit raw .pipeline.md
            </Button>
            <Button
              intent="run"
              icon="play"
              onClick={() => {
                onLaunch?.({ pipeline, prompt, project, budget, overrides })
                setLaunched(true)
              }}
            >
              Spustit · max ${budget}
            </Button>
          </Stack>
        )
      }
    >
      {launched ? (
        <Container textAlign="center" padding={["200", "100"]}>
          <Stack align="center" gap="100">
            <IconTile glyph="flow" size="xl" shape="circle" filled={false} glow />
            <Typography type="subtitle" size="xl" weight="semibold">
              Pipeline spuštěna na pozadí
            </Typography>
            <Typography type="note" mono size="base" variant="secondary">
              {pipeline.name} → {project} · strop ${budget}
            </Typography>
            <Typography type="note" size="md" variant="secondary">
              Sleduj fáze v sekci{" "}
              <Typography as="span" type="note" size="md" tone="accent">
                Běžící agenti
              </Typography>{" "}
              · pracuje v izolované branchi.
            </Typography>
            <Button intent="ghost" icon="pulse" onClick={onClose}>
              Zavřít
            </Button>
          </Stack>
        </Container>
      ) : (
        <Stack gap="200">
          <TextAreaField
            label="Zadání"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            autoFocus
            placeholder={`Co má pipeline „${pipeline.name}" udělat…`}
          />

          <Grid cols={2} gap="250">
            <SegmentedField
              label="Cílový projekt"
              value={project}
              options={projects.slice(0, 4).map((p) => ({ value: p, label: p }))}
              onValueChange={setProject}
            />
            <SegmentedField
              label="Rozpočet (strop)"
              value={String(budget)}
              options={[10, 25, 50].map((b) => ({ value: String(b), label: `$${b}` }))}
              onValueChange={(v) => setBudget(Number(v))}
            />
          </Grid>

          <Stack gap="75">
            <Typography
              type="note"
              mono
              size="sm"
              uppercase
              tracking="wider"
              variant="tertiary"
            >
              Override modelu / thinking pro tenhle běh
            </Typography>
            <Card radius="sm">
              {pipeline.phases.map((ph, i) => (
                <Fragment key={`${ph.agent}-${i}`}>
                  {i > 0 && <Divider />}
                  <Container padding={["100", "150"]}>
                    <Stack direction="row" align="center" gap="100">
                      <Icon name={glyphForAgent(ph.agent, agents)} size="sm" tone="accent" />
                      <Container grow minW0>
                        <Typography type="note" mono size="caption">
                          {ph.agent}
                        </Typography>
                      </Container>
                      <Pressable
                        aria-label={`Změnit model pro ${ph.agent}`}
                        onClick={() => cycleModel(i)}
                      >
                        <ModelBadge model={overrides[i]!.model} />
                      </Pressable>
                      <Pressable
                        aria-label={`Změnit thinking pro ${ph.agent}`}
                        onClick={() => cycleThink(i)}
                      >
                        <ThinkBadge level={overrides[i]!.thinking} />
                      </Pressable>
                    </Stack>
                  </Container>
                </Fragment>
              ))}
            </Card>
            <Typography type="note" mono size="xs" variant="tertiary">
              klikni na badge pro override · defaulty z agent.md, push do branche čeká na tvé schválení
            </Typography>
          </Stack>
        </Stack>
      )}
    </Dialog>
  )
}
