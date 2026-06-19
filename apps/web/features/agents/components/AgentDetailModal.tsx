"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Container,
  Dialog,
  type IconName,
  IconTile,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  Typography,
} from "@zibby/design-system";
import type { Agent, Category, GateRuleInput, GlobalGateRule } from "@zibby/contracts";
import { useFormControls } from "@zibby/forms";
import type { Pipeline } from "../../../domain";
import { agentFile } from "../agentDraft";
import { RuleModal } from "../../gates/components/RuleModal";
import { AgentRulesSection } from "./AgentRulesSection";
import { AgentEditBasics } from "./AgentEditBasics";
import { AgentViewDetails } from "./AgentViewDetails";
import type { AgentEditValues } from "./agentEditValues";

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

/** Convert an own rule into the shape `RuleModal` prefills from (a global rule). */
function ownRuleToInitial(gate: GateRuleInput): GlobalGateRule {
  return {
    id: "own",
    match: gate.match,
    decision: gate.decision,
    ...(gate.resolve ? { resolve: gate.resolve } : {}),
  };
}

/** The agent's persisted fields as form defaults (used on open and on edit-reset). */
function toFormValues(agent: Agent): AgentEditValues {
  return {
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
  };
}

/**
 * The agent detail dialog — an orchestrator over three states: the read-only
 * view ({@link AgentViewDetails}), the tabbed editor ({@link AgentEditBasics} +
 * {@link AgentRulesSection}) and the delete confirmation. It owns the form
 * instance, the view/edit switch and the own-rule editor wiring.
 */
export function AgentDetailModal({
  agent,
  mode: initialMode,
  categories,
  pipelines,
  onClose,
  onSave,
  onDelete,
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
    defaultValues: toFormValues(agent),
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
      <Button icon="x" intent="danger" onClick={() => setConfirm(true)} size="sm">
        {t("delete")}
      </Button>
      <Stack align="center" direction="row" gap="100">
        <Button
          icon="edit"
          intent="ghost"
          onClick={() => {
            form.reset(toFormValues(agent));
            setEditTab("basics");
            setMode("edit");
          }}
          size="sm"
        >
          {t("edit")}
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
        intent="primary"
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
              {agent.category && <Tag tone="neutral">{agent.category}</Tag>}
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
              <AgentEditBasics categories={categories} control={form.control} />
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
          <AgentViewDetails agent={agent} usedBy={usedBy} />
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
                intent="danger"
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
          initial={
            typeof editingRule === "number"
              ? ownRuleToInitial(watchedGates[editingRule]!)
              : undefined
          }
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
