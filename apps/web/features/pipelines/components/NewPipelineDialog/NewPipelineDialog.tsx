"use client";
import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  Agent,
  AgentModel,
  AgentThinking,
  CreatePipelineInput,
} from "@zibby/contracts";
import {
  Button,
  Card,
  Container,
  Dialog,
  Icon,
  IconTile,
  Pressable,
  SelectField,
  Stack,
  TextAreaField,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import type { IconName } from "@zibby/design-system";
import { slug } from "../../../../utils/slug";
import { ModelBadge, ThinkBadge } from "../PhaseChain";

const CYCLE_MODEL: AgentModel[] = ["opus", "sonnet", "haiku"];
const CYCLE_THINK: AgentThinking[] = ["high", "medium", "low"];
const next = <T,>(arr: T[], v: T): T => arr[(arr.indexOf(v) + 1) % arr.length]!;

/** The file the first agent picks up as its assignment. */
const INITIAL_ASSIGNMENT = "task.md";

/**
 * One link of the chain being composed. `consumes` is not stored — it is always
 * the previous step's `produces` (the handoff), or the initial assignment file
 * for the first step. `key` keeps React identity stable across removals.
 */
interface ChainStep {
  key: number;
  agent: string;
  produces: string;
  model: AgentModel;
  thinking: AgentThinking;
}

export interface NewPipelineDialogProps {
  agents: Agent[];
  /** Disables the submit while the create request is in flight. */
  isPending?: boolean;
  onClose: () => void;
  onCreate: (input: CreatePipelineInput) => void;
}

/**
 * The "New pipeline" dialog: name + description plus a one-way agent chain.
 * Each step picks an agent and names the handoff file it writes; the next step
 * picks that same file up as its assignment, so the chain editor only ever
 * exposes a single file per arrow.
 */
export function NewPipelineDialog({
  agents,
  isPending = false,
  onClose,
  onCreate,
}: NewPipelineDialogProps) {
  const t = useTranslations();

  const makeStep = (key: number): ChainStep => ({
    key,
    agent: agents[0]?.id ?? "",
    produces: `handoff-${key}.md`,
    model: "sonnet",
    thinking: "medium",
  });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [assignment, setAssignment] = useState(INITIAL_ASSIGNMENT);
  const [steps, setSteps] = useState<ChainStep[]>(() => [makeStep(1)]);

  const patchStep = (i: number, patch: Partial<ChainStep>) =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const addStep = () =>
    setSteps((all) => [
      ...all,
      makeStep(Math.max(0, ...all.map((s) => s.key)) + 1),
    ]);

  const agentOptions = agents.map((a) => ({
    value: a.id,
    label: a.name ?? a.id,
  }));

  const glyphFor = (agentId: string): IconName =>
    (agents.find((a) => a.id === agentId)?.glyph as IconName | undefined) ??
    "bot";

  const canSubmit =
    !isPending &&
    name.trim().length > 0 &&
    assignment.trim().length > 0 &&
    steps.every((s) => s.agent && s.produces.trim().length > 0);

  const id = slug(name, "novy");

  const submit = () => {
    const description = desc.trim() || t("defaults.pipeline");
    onCreate({
      id,
      name: name.trim() || id,
      desc: description,
      instructions: description,
      phases: steps.map((s, i) => ({
        id: `phase-${i + 1}`,
        type: "agent" as const,
        agent: s.agent,
        consumes: i === 0 ? assignment.trim() : steps[i - 1]!.produces.trim(),
        produces: s.produces.trim(),
        model: s.model,
        thinking: s.thinking,
      })),
    });
  };

  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!canSubmit}
            form="new-pipeline-form"
            icon="plus"
            intent="primary"
            loading={isPending}
            type="submit"
          >
            {t("forms.pipeline.submitLabel")}
          </Button>
        </>
      }
      ariaLabel={t("forms.pipeline.title")}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph="flow" size="md" />
          <Container minW0>
            <Typography mono size="xl" type="note" weight="bold">
              {t("forms.pipeline.title")}
            </Typography>
            <Typography size="base" type="note" variant="secondary">
              {t("forms.pipeline.subtitle")}
            </Typography>
          </Container>
        </Stack>
      }
      width="xl"
    >
      <form
        id="new-pipeline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) submit();
        }}
      >
        <Stack gap="200">
          <TextInputField
            label={t("forms.pipeline.nameLabel")}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("forms.pipeline.namePlaceholder")}
            value={name}
          />
          <TextAreaField
            label={t("forms.pipeline.descLabel")}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={t("forms.pipeline.descPlaceholder")}
            value={desc}
          />

          <Stack gap="100">
            <Typography
              mono
              uppercase
              size="sm"
              tracking="wider"
              type="note"
              variant="tertiary"
            >
              {t("pipelines.chainTitle")}
            </Typography>

            {agents.length === 0 && (
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("forms.pipeline.noAgents")}
              </Typography>
            )}

            <TextInputField
              hint={t("forms.pipeline.assignmentHint")}
              label={t("forms.pipeline.assignmentLabel")}
              onChange={(e) => setAssignment(e.target.value)}
              value={assignment}
            />

            {steps.map((s, i) => (
              <Fragment key={s.key}>
                <Card radius="sm">
                  <Container padding="150">
                    <Stack gap="150">
                      <Stack align="center" direction="row" gap="100">
                        <IconTile glyph={glyphFor(s.agent)} size="sm" />
                        <Container grow minW0>
                          <Typography
                            mono
                            size="2xs"
                            tracking="wider"
                            type="note"
                            variant="tertiary"
                          >
                            {t("phase.phaseLabel", { n: i + 1 })}
                          </Typography>
                        </Container>
                        <Pressable
                          aria-label={t("pipelineRun.changeModelAria", {
                            agent: s.agent,
                          })}
                          onClick={() =>
                            patchStep(i, { model: next(CYCLE_MODEL, s.model) })
                          }
                        >
                          <ModelBadge model={s.model} />
                        </Pressable>
                        <Pressable
                          aria-label={t("pipelineRun.changeThinkAria", {
                            agent: s.agent,
                          })}
                          onClick={() =>
                            patchStep(i, {
                              thinking: next(CYCLE_THINK, s.thinking),
                            })
                          }
                        >
                          <ThinkBadge level={s.thinking} />
                        </Pressable>
                        {steps.length > 1 && (
                          <Pressable
                            aria-label={t("forms.pipeline.removeStepAria", {
                              n: i + 1,
                            })}
                            onClick={() =>
                              setSteps((all) => all.filter((_, j) => j !== i))
                            }
                          >
                            <Icon name="trash" size="sm" tone="dim" />
                          </Pressable>
                        )}
                      </Stack>
                      <SelectField
                        label={t("forms.pipeline.agentLabel")}
                        onValueChange={(v) => patchStep(i, { agent: v })}
                        options={agentOptions}
                        value={s.agent}
                      />
                      <TextInputField
                        hint={
                          i === steps.length - 1
                            ? t("forms.pipeline.outputHint")
                            : t("forms.pipeline.handoffHint")
                        }
                        label={t("forms.pipeline.handoffLabel")}
                        onChange={(e) =>
                          patchStep(i, { produces: e.target.value })
                        }
                        value={s.produces}
                      />
                    </Stack>
                  </Container>
                </Card>
                {i < steps.length - 1 && (
                  <Stack align="center" gap="25">
                    <Typography mono size="xs" tone="accent" type="note">
                      {s.produces.trim() || "—"}
                    </Typography>
                    <Typography mono size="2xs" type="note" variant="tertiary">
                      ↓ {t("forms.pipeline.handoffNote")}
                    </Typography>
                  </Stack>
                )}
              </Fragment>
            ))}

            <Button
              icon="plus"
              intent="ghost"
              onClick={addStep}
              size="sm"
              type="button"
            >
              {t("forms.pipeline.addStep")}
            </Button>
          </Stack>

          <Card background="background" radius="sm">
            <Container padding={["150", "150"]}>
              <Stack align="center" direction="row" gap="100">
                <Icon name="file" size="sm" tone="faint" />
                <Container minW0>
                  <Typography mono truncate size="sm" type="note" variant="tertiary">
                    {`~/zibby/pipelines/${id}.pipeline.md`}
                  </Typography>
                </Container>
              </Stack>
            </Container>
          </Card>
        </Stack>
      </form>
    </Dialog>
  );
}
