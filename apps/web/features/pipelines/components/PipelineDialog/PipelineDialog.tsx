"use client";
import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  Agent,
  AgentModel,
  AgentThinking,
  CreatePipelineInput,
  UpdatePipelineInput,
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
  ToggleField,
  Typography,
} from "@zibby/design-system";
import type { IconName } from "@zibby/design-system";
import type { PhaseEscalation, Pipeline } from "../../../../domain";
import { slug } from "../../../../utils/slug";
import { ModelBadge, ThinkBadge } from "../PhaseChain";

const CYCLE_MODEL: AgentModel[] = ["opus", "sonnet", "haiku"];
const CYCLE_THINK: AgentThinking[] = ["high", "medium", "low"];
const next = <T,>(arr: T[], v: T): T => arr[(arr.indexOf(v) + 1) % arr.length]!;

/** The file the first agent picks up as its assignment. */
const INITIAL_ASSIGNMENT = "task.md";

/** Loop editor state — `null` while the phase has no back-edge. */
interface StepLoop {
  to: string;
  maxRetries: number;
  escalate: boolean;
  then: string;
  escalation: PhaseEscalation[];
}

/**
 * One link of the chain being composed. `consumes` is not stored — it is always
 * the last *producing* step's `produces` (the handoff), or the initial
 * assignment file for the first step. `key` keeps React identity stable across
 * removals; `id` is the durable phase id loop targets reference (an edited
 * pipeline keeps its original ids so existing loops stay valid).
 */
interface ChainStep {
  key: number;
  id: string;
  type: "agent" | "verify";
  agent: string;
  produces: string;
  model: AgentModel;
  thinking: AgentThinking;
  /** Verify checks, one command per line ("" = project/default checks). */
  commands: string;
  loop: StepLoop | null;
}

export interface PipelineDialogProps {
  mode: "create" | "edit";
  agents: Agent[];
  /** Edit mode: the pipeline being edited (pre-fills every control). */
  initial?: Pipeline;
  /** Disables the submit while the request is in flight. */
  isPending?: boolean;
  onClose: () => void;
  /** Create mode submit. */
  onCreate?: (input: CreatePipelineInput) => void;
  /** Edit mode submit — only the fields that actually changed. */
  onSave?: (id: string, patch: UpdatePipelineInput) => void;
}

type ContractPhase = CreatePipelineInput["phases"][number];

function initialSteps(initial: Pipeline | undefined, agents: Agent[]): ChainStep[] {
  if (!initial) return [];
  return initial.phases.map((ph, i) => ({
    key: i + 1,
    id: ph.id ?? `phase-${i + 1}`,
    type: ph.type,
    agent: ph.agent ?? agents[0]?.id ?? "",
    produces: ph.produces ?? "",
    model: ph.model ?? "sonnet",
    thinking: ph.thinking ?? "medium",
    commands: (ph.commands ?? []).join("\n"),
    loop: ph.loop
      ? {
          to: ph.loop.to,
          maxRetries: ph.loop.maxRetries,
          escalate: ph.loop.escalate,
          then: ph.loop.then,
          escalation: ph.loop.escalation ?? [],
        }
      : null,
  }));
}

/** Project the dialog steps to the contract phase array. */
function toPhases(steps: ChainStep[], assignment: string): ContractPhase[] {
  let handoff = assignment.trim();
  return steps.map((s) => {
    const loop = s.loop
      ? {
          to: s.loop.to,
          maxRetries: s.loop.maxRetries,
          escalate: s.loop.escalate,
          then: s.loop.then,
          ...(s.loop.escalation.length > 0 ? { escalation: s.loop.escalation } : {}),
        }
      : undefined;
    if (s.type === "verify") {
      const commands = s.commands
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);
      return {
        id: s.id,
        type: "verify" as const,
        ...(commands.length > 0 ? { commands } : {}),
        ...(loop ? { loop } : {}),
      };
    }
    const phase: ContractPhase = {
      id: s.id,
      type: "agent" as const,
      agent: s.agent,
      consumes: handoff,
      produces: s.produces.trim(),
      model: s.model,
      thinking: s.thinking,
      ...(loop ? { loop } : {}),
    };
    handoff = s.produces.trim();
    return phase;
  });
}

/**
 * The pipeline authoring dialog — one component for both creating and editing.
 * Keeps the proven plain-state pattern (a dynamic phase array); per phase it
 * adds the type picker (agent | verify), and a loop editor (back-edge to an
 * earlier phase, maxRetries, escalate, `then` of phase ids + fail + park, and
 * an optional per-retry escalation ladder).
 */
export function PipelineDialog({
  mode,
  agents,
  initial,
  isPending = false,
  onClose,
  onCreate,
  onSave,
}: PipelineDialogProps) {
  const t = useTranslations();

  const makeStep = (key: number): ChainStep => ({
    key,
    id: `phase-${key}`,
    type: "agent",
    agent: agents[0]?.id ?? "",
    produces: `handoff-${key}.md`,
    model: "sonnet",
    thinking: "medium",
    commands: "",
    loop: null,
  });

  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.desc ?? "");
  const [assignment, setAssignment] = useState(
    initial?.phases[0]?.consumes ?? INITIAL_ASSIGNMENT,
  );
  const [steps, setSteps] = useState<ChainStep[]>(() =>
    initial ? initialSteps(initial, agents) : [makeStep(1)],
  );

  const patchStep = (i: number, patch: Partial<ChainStep>) =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const patchLoop = (i: number, patch: Partial<StepLoop>) =>
    setSteps((s) =>
      s.map((x, j) => (j === i && x.loop ? { ...x, loop: { ...x.loop, ...patch } } : x)),
    );

  const addStep = () =>
    setSteps((all) => [...all, makeStep(Math.max(0, ...all.map((s) => s.key)) + 1)]);

  const agentOptions = agents.map((a) => ({ value: a.id, label: a.name ?? a.id }));

  const glyphFor = (s: ChainStep): IconName =>
    s.type === "verify"
      ? "shield"
      : ((agents.find((a) => a.id === s.agent)?.glyph as IconName | undefined) ?? "bot");

  const typeOptions = [
    { value: "agent", label: t("forms.pipeline.typeAgent") },
    { value: "verify", label: t("forms.pipeline.typeVerify") },
  ];

  const canSubmit =
    !isPending &&
    name.trim().length > 0 &&
    assignment.trim().length > 0 &&
    steps.length > 0 &&
    steps.every(
      (s) => s.type === "verify" || (s.agent && s.produces.trim().length > 0),
    ) &&
    steps.every((s) => !s.loop || (s.loop.to && s.loop.then));

  const id = mode === "edit" && initial ? initial.id : slug(name, "novy");

  const submit = () => {
    const description = desc.trim() || t("defaults.pipeline");
    const phases = toPhases(steps, assignment);
    if (mode === "create") {
      onCreate?.({
        id,
        name: name.trim() || id,
        desc: description,
        instructions: description,
        phases,
      });
      return;
    }
    if (!initial) return;
    // PATCH only what actually changed — the storage merges the partial.
    const patch: UpdatePipelineInput = {};
    if (name.trim() !== initial.name) patch.name = name.trim();
    if (desc.trim() !== (initial.desc ?? "")) patch.desc = desc.trim();
    const initialPhases = toPhases(initialSteps(initial, agents), initial.phases[0]?.consumes ?? assignment);
    if (JSON.stringify(phases) !== JSON.stringify(initialPhases)) patch.phases = phases;
    onSave?.(initial.id, patch);
  };

  const title = mode === "create" ? t("forms.pipeline.title") : t("forms.pipeline.editTitle");

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
            form="pipeline-dialog-form"
            icon={mode === "create" ? "plus" : "edit"}
            intent="primary"
            loading={isPending}
            type="submit"
          >
            {mode === "create"
              ? t("forms.pipeline.submitLabel")
              : t("forms.pipeline.saveLabel")}
          </Button>
        </>
      }
      ariaLabel={title}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph="flow" size="md" />
          <Container minW0>
            <Typography mono size="xl" type="note" weight="bold">
              {title}
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
        id="pipeline-dialog-form"
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
                        <IconTile glyph={glyphFor(s)} size="sm" />
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
                        {s.type === "agent" && (
                          <>
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
                                patchStep(i, { thinking: next(CYCLE_THINK, s.thinking) })
                              }
                            >
                              <ThinkBadge level={s.thinking} />
                            </Pressable>
                          </>
                        )}
                        {steps.length > 1 && (
                          <Pressable
                            aria-label={t("forms.pipeline.removeStepAria", { n: i + 1 })}
                            onClick={() =>
                              setSteps((all) => all.filter((_, j) => j !== i))
                            }
                          >
                            <Icon name="trash" size="sm" tone="dim" />
                          </Pressable>
                        )}
                      </Stack>

                      <SelectField
                        label={t("forms.pipeline.typeLabel")}
                        onValueChange={(v) =>
                          patchStep(i, { type: v as ChainStep["type"] })
                        }
                        options={typeOptions}
                        value={s.type}
                      />

                      {s.type === "agent" ? (
                        <>
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
                            onChange={(e) => patchStep(i, { produces: e.target.value })}
                            value={s.produces}
                          />
                        </>
                      ) : (
                        <TextAreaField
                          hint={t("forms.pipeline.commandsHint")}
                          label={t("forms.pipeline.commandsLabel")}
                          onChange={(e) => patchStep(i, { commands: e.target.value })}
                          placeholder={"pnpm lint\npnpm test"}
                          value={s.commands}
                        />
                      )}

                      <ToggleField
                        checked={s.loop !== null}
                        label={t("forms.pipeline.loopToggle")}
                        onChange={(on) =>
                          patchStep(i, {
                            loop: on
                              ? {
                                  to: steps[0]?.id ?? s.id,
                                  maxRetries: 3,
                                  escalate: true,
                                  then: "park",
                                  escalation: [],
                                }
                              : null,
                          })
                        }
                      />

                      {s.loop && (
                        <Card background="background" radius="sm">
                          <Container padding="150">
                            <Stack gap="150">
                              <SelectField
                                label={t("forms.pipeline.loopToLabel")}
                                onValueChange={(v) => patchLoop(i, { to: v })}
                                options={steps.slice(0, i).map((p, j) => ({
                                  value: p.id,
                                  label: `${j + 1} · ${p.type === "verify" ? t("forms.pipeline.typeVerify") : p.agent}`,
                                }))}
                                value={s.loop.to}
                              />
                              <TextInputField
                                label={t("forms.pipeline.loopMaxRetriesLabel")}
                                min={0}
                                onChange={(e) =>
                                  patchLoop(i, {
                                    maxRetries: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                type="number"
                                value={String(s.loop.maxRetries)}
                              />
                              <ToggleField
                                checked={s.loop.escalate}
                                label={t("forms.pipeline.loopEscalateLabel")}
                                onChange={(on) => patchLoop(i, { escalate: on })}
                              />
                              <SelectField
                                label={t("forms.pipeline.loopThenLabel")}
                                onValueChange={(v) => patchLoop(i, { then: v })}
                                options={[
                                  ...steps.map((p, j) => ({
                                    value: p.id,
                                    label: `${j + 1} · ${p.type === "verify" ? t("forms.pipeline.typeVerify") : p.agent}`,
                                  })),
                                  { value: "fail", label: t("forms.pipeline.thenFail") },
                                  { value: "park", label: t("forms.pipeline.thenPark") },
                                ]}
                                value={s.loop.then}
                              />

                              <Stack gap="75">
                                <Typography
                                  mono
                                  uppercase
                                  size="2xs"
                                  tracking="wider"
                                  type="note"
                                  variant="tertiary"
                                >
                                  {t("forms.pipeline.escalationTitle")}
                                </Typography>
                                {s.loop.escalation.map((rung, r) => (
                                  <Stack
                                    align="end"
                                    direction="row"
                                    gap="100"
                                    key={`rung-${r}`}
                                  >
                                    <Container grow>
                                      <SelectField
                                        label={t("forms.pipeline.escalationModelLabel", {
                                          n: r + 1,
                                        })}
                                        onValueChange={(v) =>
                                          patchLoop(i, {
                                            escalation: s.loop!.escalation.map((x, y) =>
                                              y === r
                                                ? { ...x, model: v as AgentModel }
                                                : x,
                                            ),
                                          })
                                        }
                                        options={CYCLE_MODEL.map((m) => ({
                                          value: m,
                                          label: m,
                                        }))}
                                        value={rung.model ?? "sonnet"}
                                      />
                                    </Container>
                                    <Container grow>
                                      <SelectField
                                        label={t("forms.pipeline.escalationThinkLabel", {
                                          n: r + 1,
                                        })}
                                        onValueChange={(v) =>
                                          patchLoop(i, {
                                            escalation: s.loop!.escalation.map((x, y) =>
                                              y === r
                                                ? { ...x, thinking: v as AgentThinking }
                                                : x,
                                            ),
                                          })
                                        }
                                        options={CYCLE_THINK.map((m) => ({
                                          value: m,
                                          label: m,
                                        }))}
                                        value={rung.thinking ?? "medium"}
                                      />
                                    </Container>
                                    <Pressable
                                      aria-label={t("forms.pipeline.removeRungAria", {
                                        n: r + 1,
                                      })}
                                      onClick={() =>
                                        patchLoop(i, {
                                          escalation: s.loop!.escalation.filter(
                                            (_, y) => y !== r,
                                          ),
                                        })
                                      }
                                    >
                                      <Icon name="trash" size="sm" tone="dim" />
                                    </Pressable>
                                  </Stack>
                                ))}
                                <Button
                                  icon="plus"
                                  intent="ghost"
                                  onClick={() =>
                                    patchLoop(i, {
                                      escalation: [
                                        ...s.loop!.escalation,
                                        { model: "opus", thinking: "high" },
                                      ],
                                    })
                                  }
                                  size="sm"
                                  type="button"
                                >
                                  {t("forms.pipeline.addRung")}
                                </Button>
                              </Stack>
                            </Stack>
                          </Container>
                        </Card>
                      )}
                    </Stack>
                  </Container>
                </Card>
                {i < steps.length - 1 && s.type === "agent" && (
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

            <Button icon="plus" intent="ghost" onClick={addStep} size="sm" type="button">
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
