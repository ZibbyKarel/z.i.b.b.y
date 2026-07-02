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
  Typography,
} from "@zibby/design-system";
import type { Agent, Category, GateRuleInput } from "@zibby/contracts";
import { useFormControls } from "@zibby/forms";
import { newAgentDraft } from "../agentDraft";
import { RuleModal } from "../../gates/components/RuleModal";
import { AgentRulesSection } from "./AgentRulesSection";
import { AgentEditBasics } from "./AgentEditBasics";
import {
  type AgentEditValues,
  applyFormValues,
  ownRuleToInitial,
  toFormValues,
} from "./agentEditValues";

export interface NewAgentDialogProps {
  categories: Category[];
  onClose: () => void;
  /** Persist the draft; the caller owns the id and the post-create navigation. */
  onCreate: (agent: Agent) => void;
  pending?: boolean;
}

/**
 * The CREATE-ONLY agent dialog (N4c) — grammar: dialogs create and confirm,
 * nothing else. Viewing and editing an existing agent live on the `/agents/:id`
 * detail page ({@link ../DetailScreen}); this dialog only births the draft.
 */
export function NewAgentDialog({ categories, onClose, onCreate, pending }: NewAgentDialogProps) {
  const t = useTranslations("agents");
  const tk = useTranslations();
  const [tab, setTab] = useState<"basics" | "rules">("basics");
  /** The own-rule being edited: an index, "new", or null when the editor is closed. */
  const [editingRule, setEditingRule] = useState<number | "new" | null>(null);

  const draft = newAgentDraft(categories[0]?.name);
  const { renderForm, submit, form } = useFormControls<AgentEditValues>({
    defaultValues: toFormValues(draft),
    onSubmit: (values) => onCreate(applyFormValues(draft, values)),
  });

  const [watchedName, watchedInstructions] = form.watch(["name", "instructions"]);
  const canCreate =
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

  return renderForm(
    <>
      <Dialog
        actions={
          <>
            <Button intent="ghost" onClick={onClose}>
              {tk("common.cancel")}
            </Button>
            <Button
              disabled={!canCreate}
              icon="plus"
              intent="primary"
              loading={pending}
              onClick={() => void submit()}
            >
              {t("create")}
            </Button>
          </>
        }
        ariaLabel={t("newAgent")}
        closeLabel={tk("common.close")}
        onClose={onClose}
        open={editingRule === null}
        title={
          <Stack align="center" direction="row" gap="150">
            <IconTile glyph={((watchedGlyph as IconName | undefined) || "bot") ?? "bot"} size="md" />
            <Container grow minW0>
              <Typography mono truncate size="xl" type="note" weight="bold">
                {t("newAgent")}
              </Typography>
            </Container>
          </Stack>
        }
        width="2xl"
      >
        <Tabs onValueChange={(v) => setTab(v as "basics" | "rules")} value={tab}>
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
                agentName={watchedName || t("newAgent")}
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
      </Dialog>

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
