"use client";

import type { Decision, GlobalGateRule, GlobalGateRuleInput } from "@zibby/contracts";
import { Button, ButtonGroup, Icon, type IconName, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
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

/**
 * The global gate-rule catalog body — the editable list of approval rules with the
 * locked system floor above it. Content only (no page chrome), so it serves both the
 * standalone `/gates` page and the "Pravidla schvalování" tab in Settings. Owns its own
 * data + modal state; `useGateRulesQuery` only fires once this mounts, so the Settings
 * tab loads gate rules lazily (the TabPanel unmounts inactive panels).
 */
export function GateRulesSection() {
  const t = useTranslations("gates");
  const rulesQuery = useGateRulesQuery();
  const rules = rulesQuery.data ?? [];
  const { data: agents = [] } = useAgentsQuery();
  const { data: skills = [] } = useSkillsQuery();

  const create = useCreateGateRuleMutation();
  const update = useUpdateGateRuleMutation();
  const remove = useDeleteGateRuleMutation();
  const reorder = useReorderGateRulesMutation();

  const [filter, setFilter] = useState<Decision | null>(null);
  const [editing, setEditing] = useState<GlobalGateRule | "new" | null>(null);

  const byDecision = (d: Decision) => rules.filter((r) => r.decision === d).length;
  const shown = filter ? rules.filter((r) => r.decision === filter) : rules;
  const ids = rules.map((r) => r.id);

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
    if (editing && editing !== "new")
      update.mutate({ params: { id: editing.id }, body: input }, done);
    else create.mutate({ body: input }, done);
  };

  return (
    <Stack gap="250">
      {/* decision filter tabs */}
      <HudPanel padding="200">
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
      <HudPanel padding="150">
        <Stack align="center" direction="row" gap="100">
          <Icon name="bolt" size="xs" tone="accent" />
          <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
            {t("hierarchyNote")}
          </Typography>
        </Stack>
      </HudPanel>

      {/* The locked POLICY.md floor — the structural guarantee, made visible above the
          editable catalog (Law 1: agents can only harden it; Law 4: never talked around). */}
      <SystemFloorPanel />

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
                canReorder={filter === null}
                isFirst={idx === 0}
                isLast={idx === ids.length - 1}
                key={rule.id}
                onDelete={(id) => remove.mutate({ params: { id } })}
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
    </Stack>
  );
}
