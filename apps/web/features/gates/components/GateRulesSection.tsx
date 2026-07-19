"use client";

import type { Decision, GlobalGateRule, GlobalGateRuleInput, SubsystemId } from "@zibby/contracts";
import { Button, ButtonGroup, Icon, type IconName, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useAgentsQuery } from "../../agents";
import { useSkillsQuery } from "../../skills";
import { DECISION_META, DECISION_ORDER } from "../gate";
import {
  useCreateGateRuleMutation,
  useDeleteGateRuleMutation,
  useReorderGateRulesMutation,
  useUpdateGateRuleMutation,
} from "../mutations";
import { useGateRulesQuery } from "../queries";
import { GlobalRuleCard, type RuleUser } from "./GlobalRuleCard";
import { RuleModal } from "./RuleModal";
import { SystemFloorPanel } from "./SystemFloorPanel";

/** Move `id` one step in the `ids` order; returns the new order or null if it can't. */
function moved(ids: string[], id: string, delta: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export interface GateRulesSectionProps {
  /**
   * Restricts the visible catalog to rules tagged for this subsystem, and
   * auto-tags every rule CREATED from this context with it (Phase 87 Gates
   * tab, its third call site). Absent = today's behavior exactly — the full
   * catalog, no auto-tag — so the Settings tab (this component's other call
   * site; F10 deleted the standalone `/gates` page, O8) is unaffected by this
   * prop's existence.
   * Reorder (whose order IS the evaluation order across the WHOLE catalog) is
   * disabled while filtered, same reasoning as the existing decision filter.
   */
  ownerSubsystem?: SubsystemId;
  /**
   * Visual language (D7, docs/hud2chat/DECISIONS.md) — threaded to every
   * `HudPanel` this component renders (its own two panels plus
   * {@link SystemFloorPanel}). Defaults to `"hud"`, so the one consumer that
   * must stay pixel-identical — `GatesTab` inside the Chat UI's subsystem
   * drawer (Phase 87, F7 seam) — is unaffected by this prop's existence. The
   * Settings "Pravidla schvalování" tab (F1) opts in with `surface="glass"`
   * (the standalone `/gates` page did too, F7, until F10 deleted it, O8).
   */
  surface?: "hud" | "glass";
}

/**
 * The global gate-rule catalog body — the editable list of approval rules with the
 * locked system floor above it. Content only (no page chrome), so it serves the
 * "Pravidla schvalování" tab in Settings AND (Phase 87) a subsystem's Gates tab
 * via `ownerSubsystem` (the standalone `/gates` page was a third consumer until
 * F10 deleted it, O8 — `GateRulesSection` and `SystemFloorPanel` themselves
 * stayed). Owns its own data + modal state;
 * `useGateRulesQuery` only fires once this mounts, so the Settings tab loads gate
 * rules lazily (the TabPanel unmounts inactive panels).
 */
export function GateRulesSection({ ownerSubsystem, surface }: GateRulesSectionProps = {}) {
  const t = useTranslations("gates");
  const tk = useTranslations();
  const rulesQuery = useGateRulesQuery();
  const allRules = rulesQuery.data ?? [];
  const rules = ownerSubsystem
    ? allRules.filter((r) => r.ownerSubsystem === ownerSubsystem)
    : allRules;
  const { data: agents = [] } = useAgentsQuery();
  const { data: skills = [] } = useSkillsQuery();

  const create = useCreateGateRuleMutation();
  const update = useUpdateGateRuleMutation();
  const remove = useDeleteGateRuleMutation();
  const reorder = useReorderGateRulesMutation();

  const [filter, setFilter] = useState<Decision | null>(null);
  const [editing, setEditing] = useState<GlobalGateRule | "new" | null>(null);
  // Deleting a rule can silently un-harden every agent/skill linked to it — confirm
  // before it fires (Phase 18).
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const byDecision = (d: Decision) => rules.filter((r) => r.decision === d).length;
  const shown = filter ? rules.filter((r) => r.decision === filter) : rules;
  const ids = rules.map((r) => r.id);
  // Reordering submits a full-catalog id permutation (`GateRulesStorageService.reorder`
  // 422s on anything else) — `ids` above is only the FILTERED subset once
  // `ownerSubsystem` is set, so reorder must stay off exactly like the decision filter.
  const canReorder = filter === null && !ownerSubsystem;

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

  const move = (id: string, delta: -1 | 1) => {
    const next = moved(ids, id, delta);
    if (next) reorder.mutate({ body: { ids: next } });
  };

  const save = (input: GlobalGateRuleInput) => {
    const done = { onSuccess: () => setEditing(null) };
    if (editing && editing !== "new") {
      // RuleModal's form has no ownerSubsystem field (the sentence-builder
      // AUTHORING UI is deferred, per the Phase 87 plan) — its `input` never
      // carries the tag, so an edit must re-attach whatever tag the rule
      // already had or saving would silently un-tag it.
      const body = editing.ownerSubsystem
        ? { ...input, ownerSubsystem: editing.ownerSubsystem }
        : input;
      update.mutate({ params: { id: editing.id }, body }, done);
    } else {
      const body = ownerSubsystem ? { ...input, ownerSubsystem } : input;
      create.mutate({ body }, done);
    }
  };

  return (
    <Stack gap="250">
      {/* decision filter tabs */}
      <HudPanel padding="200" surface={surface}>
        <Stack wrap align="center" direction="row" gap="100">
          <ButtonGroup
            deselectable
            ariaLabel={t("title")}
            onChange={(v) => setFilter(v ? (v as Decision) : null)}
            options={DECISION_ORDER.map((d) => ({
              id: d,
              label: t(`decision_.${d}`),
              leading: <Icon name={DECISION_META[d].icon} size="sm" />,
              trailing: byDecision(d),
            }))}
            value={filter ?? ""}
          />
          <Stack grow align="center" direction="row" justify="end">
            <Typography mono size="2xs" type="note" variant="tertiary">
              {t("totalCount", { count: rules.length })}
            </Typography>
          </Stack>
        </Stack>
      </HudPanel>

      {/* hierarchy note: system floor → this catalog → agent/skill rules */}
      <HudPanel padding="150" surface={surface}>
        <Stack align="center" direction="row" gap="100">
          <Icon name="bolt" size="xs" tone="accent" />
          <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
            {t("hierarchyNote")}
          </Typography>
        </Stack>
      </HudPanel>

      {/* The locked POLICY.md floor — the structural guarantee, made visible above the
          editable catalog (Law 1: agents can only harden it; Law 4: never talked around). */}
      <SystemFloorPanel surface={surface} />

      {rulesQuery.isPending ? (
        <QueryLoading />
      ) : rulesQuery.isError ? (
        <QueryError onRetry={() => void rulesQuery.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState
          description={filter ? t("emptyFilteredDesc") : t("emptyDesc")}
          glyph="shield"
          title={filter ? t("emptyFilteredTitle") : t("emptyTitle")}
        />
      ) : (
        <Stack gap="100">
          {shown.map((rule) => {
            const users = usersFor(rule.id);
            const idx = ids.indexOf(rule.id);
            return (
              <GlobalRuleCard
                agents={users.agents}
                canReorder={canReorder}
                isFirst={idx === 0}
                isLast={idx === ids.length - 1}
                key={rule.id}
                onDelete={(id) => setDeletingId(id)}
                onEdit={(r) => setEditing(r)}
                onMoveDown={(id) => move(id, 1)}
                onMoveUp={(id) => move(id, -1)}
                rule={rule}
                skills={users.skills}
              />
            );
          })}
        </Stack>
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
