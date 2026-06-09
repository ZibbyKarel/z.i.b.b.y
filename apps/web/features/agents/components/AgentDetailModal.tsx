"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Chip,
  CodeBlock,
  Container,
  Dialog,
  Icon,
  type IconName,
  IconTile,
  Pressable,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from "@zibby/design-system";
import type {
  Agent,
  AgentModel,
  AgentThinking,
  Category,
  GateRuleInput,
  GlobalGateRule,
} from "@zibby/contracts";
import type { Pipeline } from "../../../domain";
import { AGENT_GLYPHS, AGENT_TOOLS, MODEL_OPTIONS, THINKING_OPTIONS } from "../../../state/config";
import { agentFile } from "../agentDraft";
import { ModelBadge, ThinkBadge } from "../../pipelines/components/PhaseChain";
import { RuleModal } from "../../gates/components/RuleModal";
import { AgentRulesSection } from "./AgentRulesSection";
import {
  Controller,
  FormMarkdownEditor,
  FormSegmentPicker,
  FormTextInput,
  useFormControls,
} from "@zibby/forms";

export interface AgentDetailModalProps {
  agent: Agent;
  mode: "view" | "new";
  categories: Category[];
  pipelines: Pipeline[];
  onClose: () => void;
  onSave: (agent: Agent, isNew: boolean) => void;
  onDelete: (id: string) => void;
  onRun: (agent: Agent) => void;
}

type AgentEditValues = {
  name: string;
  description: string;
  glyph: string;
  model: AgentModel;
  thinking: AgentThinking;
  tools: string[];
  category: string;
  instructions: string;
  /** The agent's own approval-gate rules (frontmatter `gates`). */
  gates: GateRuleInput[];
  /** Ids of linked global catalog rules (frontmatter `gateRuleIds`). */
  gateRuleIds: string[];
};

/** Convert an own rule into the shape `RuleModal` prefills from (a global rule). */
function ownRuleToInitial(gate: GateRuleInput): GlobalGateRule {
  return { id: "own", match: gate.match, decision: gate.decision, ...(gate.resolve ? { resolve: gate.resolve } : {}) };
}

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable onClick={onClick}>
      <Chip tone={active ? "accent" : "neutral"}>{children}</Chip>
    </Pressable>
  );
}

export function AgentDetailModal({
  agent,
  mode: initialMode,
  categories,
  pipelines,
  onClose,
  onSave,
  onDelete,
  onRun,
}: AgentDetailModalProps) {
  const t = useTranslations("agents");
  const tk = useTranslations();
  const isNew = initialMode === "new";
  const [mode, setMode] = useState<"view" | "edit">(isNew ? "edit" : "view");
  const [confirm, setConfirm] = useState(false);
  const [editTab, setEditTab] = useState<"basics" | "rules">("basics");
  /** The own-rule being edited: an index, "new", or null when the editor is closed. */
  const [editingRule, setEditingRule] = useState<number | "new" | null>(null);

  const name = agent.name ?? agent.id;
  const usedBy = pipelines.filter((p) => p.phases.some((ph) => ph.agent === agent.name));

  const { renderForm, submit, form } = useFormControls<AgentEditValues>({
    defaultValues: {
      name: agent.name ?? "",
      description: agent.description ?? "",
      glyph: agent.glyph ?? "",
      model: agent.model ?? "sonnet",
      thinking: agent.thinking ?? "medium",
      tools: agent.tools ?? [],
      category: agent.category ?? "",
      instructions: agent.instructions,
      gates: agent.gates ?? [],
      gateRuleIds: agent.gateRuleIds ?? [],
    },
    onSubmit: (values) => {
      onSave(
        {
          ...agent,
          name: values.name || undefined,
          description: values.description || undefined,
          glyph: values.glyph || undefined,
          model: values.model,
          thinking: values.thinking,
          tools: values.tools,
          category: values.category || undefined,
          instructions: values.instructions,
          gates: values.gates,
          gateRuleIds: values.gateRuleIds,
        },
        isNew,
      );
      if (!isNew) setMode("view");
    },
  });

  const [watchedName, watchedInstructions] = form.watch(["name", "instructions"]);
  const canSave =
    (watchedName ?? "").trim().length > 0 && (watchedInstructions ?? "").trim().length > 0;

  const watchedGlyph = form.watch("glyph");
  const watchedGates = form.watch("gates") ?? [];
  const watchedGateRuleIds = form.watch("gateRuleIds") ?? [];

  const setGates = (next: GateRuleInput[]) => form.setValue("gates", next, { shouldDirty: true });

  /** Save one own-rule from the rule editor (append for "new", replace by index). */
  const saveRule = (gate: GateRuleInput) => {
    setGates(
      editingRule === "new"
        ? [...watchedGates, gate]
        : watchedGates.map((g, i) => (i === editingRule ? gate : g)),
    );
    setEditingRule(null);
  };

  const viewActions = (
    <Stack grow align="center" direction="row" justify="between">
      <Button icon="x" intent="reject" onClick={() => setConfirm(true)} size="sm">
        {t("delete")}
      </Button>
      <Stack align="center" direction="row" gap="100">
        <Button
          icon="edit"
          intent="ghost"
          onClick={() => {
            form.reset({
              name: agent.name ?? "",
              description: agent.description ?? "",
              glyph: agent.glyph ?? "",
              model: agent.model ?? "sonnet",
              thinking: agent.thinking ?? "medium",
              tools: agent.tools ?? [],
              category: agent.category ?? "",
              instructions: agent.instructions,
              gates: agent.gates ?? [],
              gateRuleIds: agent.gateRuleIds ?? [],
            });
            setEditTab("basics");
            setMode("edit");
          }}
          size="sm"
        >
          {t("edit")}
        </Button>
        <Button icon="play" intent="run" onClick={() => onRun(agent)} size="sm">
          {t("runAdhoc")}
        </Button>
      </Stack>
    </Stack>
  );

  const editActions = (
    <>
      <Button
        intent="ghost"
        onClick={() => {
          if (isNew) onClose();
          else setMode("view");
        }}
      >
        {tk("common.cancel")}
      </Button>
      <Button
        disabled={!canSave}
        icon={isNew ? "plus" : "check"}
        intent="run"
        onClick={() => void submit()}
      >
        {isNew ? t("create") : t("save")}
      </Button>
    </>
  );

  const editing = mode === "edit" || isNew;

  return renderForm(
    <>
      <Dialog
        actions={editing ? editActions : viewActions}
        ariaLabel={isNew ? t("newAgent") : name}
        closeLabel={tk("common.close")}
        onClose={onClose}
        open={!confirm && editingRule === null}
        title={
          <Stack align="center" direction="row" gap="150">
            <IconTile
              glyph={((editing ? watchedGlyph : agent.glyph) as IconName | undefined) ?? "bot"}
              size="md"
            />
            <Container grow minW0>
              <Typography mono truncate size="xl" type="note" weight="bold">
                {isNew ? t("newAgent") : name}
              </Typography>
              {agent.category && <Chip tone="neutral">{agent.category}</Chip>}
            </Container>
          </Stack>
        }
        width={editing ? "2xl" : "lg"}
      >
        {editing ? (
          <Tabs onValueChange={(v) => setEditTab(v as "basics" | "rules")} value={editTab}>
            <TabList>
              <Tab value="basics">{t("tabBasics")}</Tab>
              <Tab value="rules">{t("tabRules")}</Tab>
            </TabList>

            <TabPanel value="basics">
              <Container padding={["200", "0", "0", "0"]}>
                <Stack align="start" direction="row" gap="300">
                  <Container grow minW0>
                    <Stack gap="200">
                <FormTextInput<AgentEditValues>
                  autoFocus
                  label={t("fields.name")}
                  name="name"
                  placeholder={t("fields.namePlaceholder")}
                />

                <FormTextInput<AgentEditValues>
                  label={t("fields.whenToUse")}
                  name="description"
                  placeholder={t("fields.whenToUsePlaceholder")}
                />

                <Controller<AgentEditValues, "category">
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <Stack gap="75">
                      <Typography mono size="sm" type="note" variant="secondary">
                        {t("fields.category")}
                      </Typography>
                      <Stack wrap direction="row" gap="75">
                        {categories.map((c) => (
                          <ChipToggle
                            active={field.value === c.name}
                            key={c.name}
                            onClick={() => field.onChange(c.name)}
                          >
                            {c.name}
                          </ChipToggle>
                        ))}
                      </Stack>
                    </Stack>
                  )}
                />

                <Stack direction="row" gap="150">
                  <Container grow minW0>
                    <FormSegmentPicker<AgentEditValues>
                      label={t("fields.model")}
                      name="model"
                      options={MODEL_OPTIONS}
                    />
                  </Container>
                  <Container grow minW0>
                    <FormSegmentPicker<AgentEditValues>
                      label={t("fields.thinking")}
                      name="thinking"
                      options={THINKING_OPTIONS}
                    />
                  </Container>
                </Stack>

                <Controller<AgentEditValues, "glyph">
                  control={form.control}
                  name="glyph"
                  render={({ field }) => (
                    <Stack gap="75">
                      <Typography mono size="sm" type="note" variant="secondary">
                        {t("fields.icon")}
                      </Typography>
                      <Stack wrap direction="row" gap="75">
                        {AGENT_GLYPHS.map((g) => (
                          <IconTile
                            interactive
                            aria-label={g}
                            aria-pressed={field.value === g}
                            as="button"
                            glyph={g}
                            key={g}
                            onClick={() => field.onChange(g)}
                            radius="default"
                            size="sm"
                            tone={field.value === g ? "accent" : "neutral"}
                          />
                        ))}
                      </Stack>
                    </Stack>
                  )}
                />

                <Controller<AgentEditValues, "tools">
                  control={form.control}
                  name="tools"
                  render={({ field }) => {
                    const tools = field.value ?? [];
                    return (
                      <Stack gap="75">
                        <Typography mono size="sm" type="note" variant="secondary">
                          {t("allowedTools")}
                        </Typography>
                        <Stack wrap direction="row" gap="75">
                          {AGENT_TOOLS.map((tool) => (
                            <ChipToggle
                              active={tools.includes(tool)}
                              key={tool}
                              onClick={() =>
                                field.onChange(
                                  tools.includes(tool)
                                    ? tools.filter((x) => x !== tool)
                                    : [...tools, tool],
                                )
                              }
                            >
                              {tool}
                            </ChipToggle>
                          ))}
                        </Stack>
                      </Stack>
                    );
                  }}
                />
              </Stack>
            </Container>

            <Container grow minW0>
              <FormMarkdownEditor<AgentEditValues>
                hint={t("fields.bodyHint")}
                label={t("fields.body")}
                name="instructions"
                placeholder={t("fields.bodyPlaceholder")}
              />
                  </Container>
                </Stack>
              </Container>
            </TabPanel>

            <TabPanel value="rules">
              <Container padding={["200", "0", "0", "0"]}>
                <AgentRulesSection
                  agentName={watchedName || agent.name || agent.id}
                  gateRuleIds={watchedGateRuleIds}
                  gates={watchedGates}
                  onAddRule={() => setEditingRule("new")}
                  onDeleteRule={(i) => setGates(watchedGates.filter((_, j) => j !== i))}
                  onEditRule={(i) => setEditingRule(i)}
                  onLinkedChange={(ids) => form.setValue("gateRuleIds", ids, { shouldDirty: true })}
                />
              </Container>
            </TabPanel>
          </Tabs>
        ) : (
          <Stack gap="200">
            <Typography leading="relaxed" size="base" type="note">
              {agent.description}.
            </Typography>

            <Card background="background" radius="sm">
              <Container padding={["150", "150"]}>
                <Stack wrap align="center" direction="row" gap="150">
                  <ModelBadge model={agent.model ?? "sonnet"} />
                  <ThinkBadge level={agent.thinking ?? "medium"} />
                </Stack>
              </Container>
            </Card>

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("allowedTools")}
              </Typography>
              <Stack wrap direction="row" gap="75">
                {(agent.tools ?? []).map((tool) => (
                  <Chip key={tool} tone="neutral">
                    {tool}
                  </Chip>
                ))}
              </Stack>
            </Stack>

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("usedInPipelines")}
              </Typography>
              {usedBy.length > 0 ? (
                <Stack gap="75">
                  {usedBy.map((p) => (
                    <Card background="background" key={p.id} radius="sm">
                      <Container padding={["100", "150"]}>
                        <Stack align="center" direction="row" gap="100">
                          <Icon name="flow" size="sm" tone="accent" />
                          <Container grow minW0>
                            <Typography mono truncate size="sm" type="note">
                              {p.name}
                            </Typography>
                          </Container>
                          <Typography mono nowrap size="xs" type="note" variant="tertiary">
                            {t("phaseCount", { count: p.phases.length })}
                          </Typography>
                        </Stack>
                      </Container>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Typography mono size="sm" type="note" variant="tertiary">
                  {t("notInPipeline")}
                </Typography>
              )}
            </Stack>

            <Stack gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("fields.body")}
              </Typography>
              <Card background="background" radius="sm">
                <CodeBlock maxHeight="sm" text={agent.instructions} />
              </Card>
            </Stack>
          </Stack>
        )}
      </Dialog>

      {confirm && (
        <Dialog
          open
          actions={
            <>
              <Button intent="ghost" onClick={() => setConfirm(false)}>
                {tk("common.cancel")}
              </Button>
              <Button
                icon="x"
                intent="reject"
                onClick={() => {
                  setConfirm(false);
                  onDelete(agent.id);
                }}
              >
                {t("delete")}
              </Button>
            </>
          }
          onClose={() => setConfirm(false)}
          title={t("deleteTitle")}
          width="sm"
        >
          <Typography size="base" type="note" variant="secondary">
            {t("deleteBody", { name, file: agentFile(agent.id) })}
          </Typography>
        </Dialog>
      )}

      {editingRule !== null && (
        <RuleModal
          initial={typeof editingRule === "number" ? ownRuleToInitial(watchedGates[editingRule]!) : undefined}
          onClose={() => setEditingRule(null)}
          onSave={(rule) =>
            saveRule({
              match: rule.match,
              decision: rule.decision,
              ...(rule.resolve ? { resolve: rule.resolve } : {}),
            })
          }
        />
      )}
    </>,
  );
}
