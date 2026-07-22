"use client";

import type { HandoffRule, HandoffRuleInput, HandoffTarget, SubsystemId } from "@zibby/contracts";
import { Button, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { usePipelinesQuery } from "../../pipelines";
import { useSubsystemsQuery } from "../../subsystems/queries";
import {
  useCreateHandoffRuleMutation,
  useDeleteHandoffRuleMutation,
  useUpdateHandoffRuleMutation,
} from "../mutations";
import { HandoffRuleEditor } from "./HandoffRuleEditor";
import { HandoffRuleRow } from "./HandoffRuleRow";

export enum HandoffRulesSectionTestId {
  Root = "handoff-rules-section-root",
  AddButton = "handoff-rules-section-add",
}

export interface HandoffRulesSectionProps {
  /** This subsystem's own OUTGOING rules only — `HandoffTab` already filtered by `from`. */
  rules: HandoffRule[];
  fromSubsystemId: SubsystemId;
  subsystemName: string;
}

/** Resolve a handoff target to a display name — subsystem/pipeline name, id as fallback. */
function resolveTargetLabel(
  target: HandoffTarget,
  subsystems: { id: string; name: string }[],
  pipelines: { id: string; name: string }[],
): string {
  const list = target.kind === "subsystem" ? subsystems : pipelines;
  return list.find((item) => item.id === target.id)?.name ?? target.id;
}

/**
 * A subsystem's outgoing handoff rules (P2, mirrors `GateRulesSection`'s shape):
 * a mad-libs sentence row per rule, an "Přidat pravidlo" button, and — in place of
 * the old modal — an inline editable sentence (`HandoffRuleEditor`) that swaps in
 * for whichever row is being edited (P2 inline-editor design doc). Owns its own
 * mutations + edit/delete-confirm state — `HandoffTab` only supplies the
 * already-filtered `rules` plus the owning subsystem's identity.
 */
export function HandoffRulesSection({
  rules,
  fromSubsystemId,
  subsystemName,
}: HandoffRulesSectionProps) {
  const t = useTranslations("subsystems.handoff");
  const tk = useTranslations();
  const { data: subsystems = [] } = useSubsystemsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();

  const create = useCreateHandoffRuleMutation();
  const update = useUpdateHandoffRuleMutation();
  const remove = useDeleteHandoffRuleMutation();

  const [editing, setEditing] = useState<HandoffRule | "new" | null>(null);
  const [deleting, setDeleting] = useState<HandoffRule | null>(null);

  const save = (input: HandoffRuleInput) => {
    const done = { onSuccess: () => setEditing(null) };
    if (editing && editing !== "new") {
      update.mutate({ params: { id: editing.id }, body: input }, done);
    } else {
      create.mutate({ body: input }, done);
    }
  };

  const toggle = (rule: HandoffRule) => {
    const { id, ...rest } = rule;
    update.mutate({ params: { id }, body: { ...rest, enabled: !rule.enabled } });
  };

  return (
    <Stack data-testid={HandoffRulesSectionTestId.Root} gap="150">
      {rules.length === 0 ? (
        <EmptyState description={t("emptyDescription")} glyph="flow" title={t("emptyTitle")} />
      ) : (
        <Stack gap="100">
          {rules.map((rule) =>
            editing !== "new" && editing?.id === rule.id ? (
              <HandoffRuleEditor
                fromSubsystemId={fromSubsystemId}
                initial={rule}
                key={rule.id}
                onCancel={() => setEditing(null)}
                onSave={save}
                pending={create.isPending || update.isPending}
                pipelines={pipelines}
                subsystemName={subsystemName}
                subsystems={subsystems}
              />
            ) : (
              <HandoffRuleRow
                key={rule.id}
                onDelete={rule.system ? undefined : () => setDeleting(rule)}
                onEdit={() => setEditing(rule)}
                onToggle={() => toggle(rule)}
                rule={rule}
                subsystemName={subsystemName}
                targetLabel={resolveTargetLabel(rule.to, subsystems, pipelines)}
              />
            ),
          )}
        </Stack>
      )}

      {editing === "new" ? (
        <HandoffRuleEditor
          fromSubsystemId={fromSubsystemId}
          onCancel={() => setEditing(null)}
          onSave={save}
          pending={create.isPending || update.isPending}
          pipelines={pipelines}
          subsystemName={subsystemName}
          subsystems={subsystems}
        />
      ) : (
        <Button
          block
          data-testid={HandoffRulesSectionTestId.AddButton}
          icon="plus"
          intent="ghost"
          onClick={() => setEditing("new")}
        >
          {t("addRule")}
        </Button>
      )}

      {deleting && (
        <ConfirmDeleteDialog
          body={t("deleteBody")}
          cancelLabel={tk("common.cancel")}
          confirmLabel={t("delete")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            remove.mutate({ params: { id: deleting.id } });
            setDeleting(null);
          }}
          pending={remove.isPending}
          title={t("deleteTitle")}
        />
      )}
    </Stack>
  );
}
