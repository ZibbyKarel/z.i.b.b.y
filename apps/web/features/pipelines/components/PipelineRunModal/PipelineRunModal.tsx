"use client";
import { Fragment, useState } from "react"
import { useTranslations } from "next-intl"
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
import type { Agent, AgentModel, AgentThinking } from "@zibby/contracts"
import { type Pipeline, glyphForAgent } from "../../../../domain"
import { ModelBadge, ThinkBadge } from "../PhaseChain"

const CYCLE_MODEL: AgentModel[] = ["opus", "sonnet", "haiku"]
const CYCLE_THINK: AgentThinking[] = ["high", "medium", "low"]
const next = <T,>(arr: T[], v: T): T => arr[(arr.indexOf(v) + 1) % arr.length]!

interface Override {
  model: AgentModel
  thinking: AgentThinking
}

export interface PipelineRunModalProps {
  pipeline: Pipeline
  agents: Agent[]
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
  const t = useTranslations()
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
              {t("pipelineRun.editRaw")}
            </Button>
            <Button
              icon="play"
              intent="run"
              onClick={() => {
                onLaunch?.({ pipeline, prompt, project, budget, overrides })
                setLaunched(true)
              }}
            >
              {t("pipelineRun.launch", { budget })}
            </Button>
          </Stack>
        )
      }
      ariaLabel={t("pipelineRun.runAria", { name: pipeline.name })}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph="flow" size="md" />
          <Container grow minW0>
            <Typography mono size="xl" type="note" weight="bold">
              {t("pipelineRun.title", { name: pipeline.name })}
            </Typography>
            <Typography size="base" type="note" variant="secondary">
              {t("pipelineRun.subtitle", { count: pipeline.phases.length })}
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
              {t("pipelineRun.launchedTitle")}
            </Typography>
            <Typography mono size="base" type="note" variant="secondary">
              {t("pipelineRun.launchedTarget", { name: pipeline.name, project, budget })}
            </Typography>
            <Typography size="md" type="note" variant="secondary">
              {t.rich("pipelineRun.watch", {
                agents: (chunks) => (
                  <Typography as="span" size="md" tone="accent" type="note">
                    {chunks}
                  </Typography>
                ),
              })}
            </Typography>
            <Button icon="pulse" intent="ghost" onClick={onClose}>
              {t("common.close")}
            </Button>
          </Stack>
        </Container>
      ) : (
        <Stack gap="200">
          <TextAreaField
            autoFocus
            label={t("pipelineRun.promptLabel")}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("pipelineRun.promptPlaceholder", { name: pipeline.name })}
            value={prompt}
          />

          <Grid cols={2} gap="250">
            <SegmentedField
              label={t("common.targetProject")}
              onValueChange={setProject}
              options={projects.slice(0, 4).map((p) => ({ value: p, label: p }))}
              value={project}
            />
            <SegmentedField
              label={t("pipelineRun.budgetLabel")}
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
              {t("pipelineRun.overrideTitle")}
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
                        aria-label={t("pipelineRun.changeModelAria", { agent: ph.agent })}
                        onClick={() => cycleModel(i)}
                      >
                        <ModelBadge model={overrides[i]!.model} />
                      </Pressable>
                      <Pressable
                        aria-label={t("pipelineRun.changeThinkAria", { agent: ph.agent })}
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
              {t("pipelineRun.overrideHint")}
            </Typography>
          </Stack>
        </Stack>
      )}
    </Dialog>
  )
}
