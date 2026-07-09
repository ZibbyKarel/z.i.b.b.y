"use client";

import { Checkbox, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";

export enum ToolGrantsFieldTestId {
  Root = "task-tool-grants",
  /** Suffixed `-${toolId}` so a test can target one specific checkbox among several. */
  Item = "task-tool-grants-item",
}

export interface ToolGrantsFieldProps {
  /** The classifier's advisory proposal (`TaskRouting.toolGrants`) — the tool ids
   *  offered as checkboxes. Empty renders nothing (see below). */
  toolIds: string[];
  /** The operator's confirmed subset, pre-checked to the full proposal. */
  checked: string[];
  onChange: (next: string[]) => void;
}

/**
 * Phase 109 — the operator-override layer of the three-layer tool-grant model
 * (decision 6 of the master plan): the classifier's advisory proposal (layer 2,
 * `TaskRouting.toolGrants`) rendered as pre-checked, editable checkboxes. The
 * confirmed set threads into `CreateTaskInput.toolGrants` (via `useTaskSubmit`),
 * independent of what was proposed — unchecking one here simply drops it from what
 * rides into dispatch. The ceiling (the target's `optionalTools`) is still
 * enforced server-side regardless of what's confirmed here (never trusted
 * blindly). Hidden entirely when there is nothing proposed — no UI noise for the
 * (today, common) case of a target with no `optionalTools` at all.
 */
export function ToolGrantsField({ toolIds, checked, onChange }: ToolGrantsFieldProps) {
  const t = useTranslations("tasks.toolGrants");

  if (toolIds.length === 0) return null;

  const toggle = (id: string, next: boolean) => {
    onChange(next ? [...checked, id] : checked.filter((c) => c !== id));
  };

  return (
    <Stack data-testid={ToolGrantsFieldTestId.Root} gap="75">
      <Typography mono size="sm" type="note" variant="secondary">
        {t("label")}
      </Typography>
      <Stack gap="50">
        {toolIds.map((id) => (
          <Checkbox
            checked={checked.includes(id)}
            data-testid={`${ToolGrantsFieldTestId.Item}-${id}`}
            key={id}
            label={id}
            onChange={(next) => toggle(id, next)}
          />
        ))}
      </Stack>
    </Stack>
  );
}
