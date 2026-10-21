"use client";

import type { Decision, DepartmentId, GlobalGateRule, GlobalGateRuleInput } from "@zibby/contracts";
import { Button, Icon, type IconName, Panel, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useAgentsQuery } from "../../agents";
import { useSkillsQuery } from "../../skills";
import {
  useCreateGateRuleMutation,
  useDeleteGateRuleMutation,
  useUpdateGateRuleMutation,
} from "../mutations";
import { useGateRulesQuery } from "../queries";
import { DecisionColumns } from "./DecisionColumns";
import { GlobalRuleCard, type RuleUser } from "./GlobalRuleCard";
import { RuleModal } from "./RuleModal";

export interface GateRulesSectionProps {
  /**
   * Restricts the visible catalog to rules tagged for this department, and
   * auto-tags every rule CREATED from this context with it (Phase 87 Gates
   * tab, its third call site). Absent = today's behavior exactly — the full
   * catalog, no auto-tag — so the Settings tab (this component's other call
   * site; F10 deleted the standalone `/gates` page, O8) is unaffected by this
   * prop's existence.
   */
  department?: DepartmentId;
}

/**
 * The global gate-rule list body — ONE list of approval rules: the built-in system
 * rules (`system: true`, the former POLICY.md floor — editable and movable, never
 * deletable) alongside the operator's own, laid out in decision columns. The
 * server applies the strictest matching rule, so order within the list is
 * irrelevant (no reorder UI). Content only (no page chrome), so it serves
 * `/governance/gates?section=global` AND a department's Gates tab via `department`.
 * Owns its own data + modal state; `useGateRulesQuery` only fires once this mounts.
 */
export function GateRulesSection({ department }: GateRulesSectionProps = {}) {
  const t = useTranslations("gates");
  const tk = useTranslations();
  const rulesQuery = useGateRulesQuery();
  const allRules = rulesQuery.data ?? [];
  const rules = department ? allRules.filter((r) => r.department === department) : allRules;
  const { data: agents = [] } = useAgentsQuery();
  const { data: skills = [] } = useSkillsQuery();

  const create = useCreateGateRuleMutation();
  const update = useUpdateGateRuleMutation();
  const remove = useDeleteGateRuleMutation();

  const [editing, setEditing] = useState<GlobalGateRule | "new" | null>(null);
  // Deleting a rule can silently un-harden every agent/skill linked to it — confirm
  // before it fires (Phase 18).
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const usersFor = (ruleId: string): { agents: RuleUser[]; skills: RuleUser[] } => ({
    agents: agents
      .filter((a) => a.gateRuleIds?.includes(ruleId))
      .map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
        glyph: (a.glyph as IconName | undefined) ?? "bot",
      })),
    skills: skills
      .filter((s) => s.gateRuleIds?.includes(ruleId))
      .map((s) => ({ id: s.id, name: s.name, glyph: s.glyph })),
  });

  // Moving a card to another column = a new decision (tier). `resolve` exists iff `ask`,
  // so a move into ask defaults it to the operator, and a move out drops it.
  const moveTo = (rule: GlobalGateRule, decision: Decision) => {
    const base = {
      name: rule.name,
      desc: rule.desc,
      match: rule.match,
      department: rule.department,
    };
    update.mutate({
      params: { id: rule.id },
      body:
        decision === "ask"
          ? { ...base, decision, resolve: rule.resolve ?? { type: "human" } }
          : { ...base, decision },
    });
  };

  const save = (input: GlobalGateRuleInput) => {
    const done = { onSuccess: () => setEditing(null) };
    if (editing && editing !== "new") {
      // RuleModal's form has no department field (the sentence-builder
      // AUTHORING UI is deferred, per the Phase 87 plan) — its `input` never
      // carries the tag, so an edit must re-attach whatever tag the rule
      // already had or saving would silently un-tag it.
      const body = {
        ...input,
        ...(editing.department ? { department: editing.department } : {}),
      };
      update.mutate({ params: { id: editing.id }, body }, done);
    } else {
      const body = department ? { ...input, department } : input;
      create.mutate({ body }, done);
    }
  };

  return (
    <Stack gap="250">
      <Stack align="center" direction="row" justify="end">
        <Typography mono size="2xs" type="note" variant="tertiary">
          {t("totalCount", { count: rules.length })}
        </Typography>
      </Stack>

      {/* hierarchy note: global rules (strictest match wins) → agent/skill can only tighten */}
      <Panel padding="150">
        <Stack align="center" direction="row" gap="100">
          <Icon name="bolt" size="xs" tone="accent" />
          <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
            {t("hierarchyNote")}
          </Typography>
        </Stack>
      </Panel>

      {rulesQuery.isPending ? (
        <QueryLoading />
      ) : rulesQuery.isError ? (
        <QueryError onRetry={() => void rulesQuery.refetch()} />
      ) : rules.length === 0 ? (
        <EmptyState description={t("emptyDesc")} glyph="shield" title={t("emptyTitle")} />
      ) : (
        <DecisionColumns
          onMove={moveTo}
          renderCard={(rule, _idx, _column, moveMenu) => {
            const users = usersFor(rule.id);
            return (
              <GlobalRuleCard
                agents={users.agents}
                key={rule.id}
                moveMenu={moveMenu}
                onDelete={(id) => setDeletingId(id)}
                onEdit={(r) => setEditing(r)}
                rule={rule}
                skills={users.skills}
              />
            );
          }}
          rules={rules}
        />
      )}

      <Button block icon="plus" intent="ghost" onClick={() => setEditing("new")}>
        {t("addRule")}
      </Button>

      {editing && (
        <RuleModal
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={save}
          pending={create.isPending || update.isPending}
        />
      )}

      {deletingId && (
        <ConfirmDeleteDialog
          body={t("deleteBody")}
          cancelLabel={tk("common.cancel")}
          confirmLabel={t("delete")}
          onCancel={() => setDeletingId(null)}
          onConfirm={() => {
            remove.mutate({ params: { id: deletingId } });
            setDeletingId(null);
          }}
          pending={remove.isPending}
          title={t("deleteTitle")}
        />
      )}
    </Stack>
  );
}
