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
  TextAreaField,
  Typography,
} from "@zibby/design-system"
import { type AgentDef, type ModelName, type Pipeline, type ThinkingLevel, glyphForAgent } from "../../../domain"
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
      actions={
        launched ? undefined : (
          <Stack grow align="center" direction="row" justify="between">
            <Button icon="edit" intent="ghost">
              Edit raw .pipeline.md
            </Button>
            <Button
              icon="play"
              intent="run"
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
      ariaLabel={`Spustit pipeline ${pipeline.name}`}
      closeLabel="Zavřít"
      onClose={onClose}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph="flow" size="md" />
          <Container grow minW0>
            <Typography mono size="xl" type="note" weight="bold">
              Spustit · {pipeline.name}
            </Typography>
            <Typography size="base" type="note" variant="secondary">
              {pipeline.phases.length} fází · víceagentní běh na pozadí
            </Typography>
          </Container>
        </Stack>
      }
      width="lg"
    >
      {launched ? (
        <Container padding={["200", "100"]} textAlign="center">
          <Stack align="center" gap="100">
            <IconTile glow filled={false} glyph="flow" shape="circle" size="xl" />
            <Typography size="xl" type="subtitle" weight="semibold">
              Pipeline spuštěna na pozadí
            </Typography>
            <Typography mono size="base" type="note" variant="secondary">
              {pipeline.name} → {project} · strop ${budget}
            </Typography>
            <Typography size="md" type="note" variant="secondary">
              Sleduj fáze v sekci{" "}
              <Typography as="span" size="md" tone="accent" type="note">
                Běžící agenti
              </Typography>{" "}
              · pracuje v izolované branchi.
            </Typography>
            <Button icon="pulse" intent="ghost" onClick={onClose}>
              Zavřít
            </Button>
          </Stack>
        </Container>
      ) : (
        <Stack gap="200">
          <TextAreaField
            autoFocus
            label="Zadání"
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Co má pipeline „${pipeline.name}" udělat…`}
            value={prompt}
          />

          <Grid cols={2} gap="250">
            <SegmentedField
              label="Cílový projekt"
              onValueChange={setProject}
              options={projects.slice(0, 4).map((p) => ({ value: p, label: p }))}
              value={project}
            />
            <SegmentedField
              label="Rozpočet (strop)"
              onValueChange={(v) => setBudget(Number(v))}
              options={[10, 25, 50].map((b) => ({ value: String(b), label: `$${b}` }))}
              value={String(budget)}
            />
          </Grid>

          <Stack gap="75">
            <Typography
              mono
              uppercase
              size="sm"
              tracking="wider"
              type="note"
              variant="tertiary"
            >
              Override modelu / thinking pro tenhle běh
            </Typography>
            <Card radius="sm">
              {pipeline.phases.map((ph, i) => (
                <Fragment key={`${ph.agent}-${i}`}>
                  {i > 0 && <Divider />}
                  <Container padding={["100", "150"]}>
                    <Stack align="center" direction="row" gap="100">
                      <Icon name={glyphForAgent(ph.agent, agents)} size="sm" tone="accent" />
                      <Container grow minW0>
                        <Typography mono size="caption" type="note">
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
            <Typography mono size="xs" type="note" variant="tertiary">
              klikni na badge pro override · defaulty z agent.md, push do branche čeká na tvé schválení
            </Typography>
          </Stack>
        </Stack>
      )}
    </Dialog>
  )
}
