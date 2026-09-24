"use client";

import type { DepartmentId, HandoffRule, HandoffRuleInput, HandoffTarget } from "@zibby/contracts";
import { Button, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { useAgentsQuery } from "../../agents/queries";
import { usePipelinesQuery } from "../../pipelines";
import { useDepartmentsQuery } from "../../departments/queries";
import {
  useCreateHandoffRuleMutation,
  useDeleteHandoffRuleMutation,
  useUpdateHandoffRuleMutation,
} from "../mutations";
import { useSignalKindsQuery } from "../queries";
import { HandoffRuleEditor } from "./HandoffRuleEditor";
import { HandoffRuleRow } from "./HandoffRuleRow";

export enum HandoffRulesSectionTestId {
  Root = "handoff-rules-section-root",
  AddButton = "handoff-rules-section-add",
}

export interface HandoffRulesSectionProps {
  /** This department's own OUTGOING rules only — `HandoffTab` already filtered by `from`. */
  rules: HandoffRule[];
  fromDepartmentId: DepartmentId;
  departmentName: string;
}

/** Resolve a handoff target to a display name — department/pipeline name, id as fallback. */
function resolveTargetLabel(
  target: HandoffTarget,
  departments: { id: string; name: string }[],
  pipelines: { id: string; name: string }[],
): string {
  const list = target.kind === "department" ? departments : pipelines;
  return list.find((item) => item.id === target.id)?.name ?? target.id;
}

/**
 * A department's outgoing handoff rules (P2, mirrors `GateRulesSection`'s shape):
 * a mad-libs sentence row per rule, an "Přidat pravidlo" button, and — in place of
 * the old modal — an inline editable sentence (`HandoffRuleEditor`) that swaps in
 * for whichever row is being edited (P2 inline-editor design doc). Owns its own
 * mutations + edit/delete-confirm state — `HandoffTab` only supplies the
 * already-filtered `rules` plus the owning department's identity.
 */
export function HandoffRulesSection({
  rules,
  fromDepartmentId,
  departmentName,
}: HandoffRulesSectionProps) {
  const t = useTranslations("departments.handoff");
  const tk = useTranslations();
  const { data: departments = [] } = useDepartmentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: agents = [] } = useAgentsQuery();
  const { data: signalKinds = [] } = useSignalKindsQuery();

  // Department ids that own ≥1 pipeline or ≥1 agent — the server hard-fails
  // dispatch to a department with an empty roster (`DepartmentEmptyRosterError`
  // in `resolveDepartmentTarget`), so the target dropdown mirrors that rule.
  const receiverDepartmentIds: string[] = [
    ...new Set([...pipelines, ...agents].map((x) => x.department).filter(Boolean) as string[]),
  ];

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
                departmentName={departmentName}
                departments={departments}
                fromDepartmentId={fromDepartmentId}
                initial={rule}
                key={rule.id}
                onCancel={() => setEditing(null)}
                onSave={save}
                pending={create.isPending || update.isPending}
                pipelines={pipelines}
                receiverDepartmentIds={receiverDepartmentIds}
                signalKinds={signalKinds}
              />
            ) : (
              <HandoffRuleRow
                departmentName={departmentName}
                key={rule.id}
                onDelete={rule.system ? undefined : () => setDeleting(rule)}
                onEdit={() => setEditing(rule)}
                onToggle={() => toggle(rule)}
                rule={rule}
                signalKinds={signalKinds}
                targetLabel={resolveTargetLabel(rule.to, departments, pipelines)}
              />
            ),
          )}
        </Stack>
      )}

      {editing === "new" ? (
        <HandoffRuleEditor
          departmentName={departmentName}
          departments={departments}
          fromDepartmentId={fromDepartmentId}
          onCancel={() => setEditing(null)}
          onSave={save}
          pending={create.isPending || update.isPending}
          pipelines={pipelines}
          receiverDepartmentIds={receiverDepartmentIds}
          signalKinds={signalKinds}
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
