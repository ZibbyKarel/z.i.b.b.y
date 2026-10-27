"use client";

import {
  AnchoredSheet,
  SheetAction,
  SheetBlock,
  SheetSection,
  SheetText,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAgentsQuery } from "../../../agents/queries";
import { useResolvedQuickActions } from "../../../quick-actions/useResolvedQuickActions";
import { useUpdateQuickActions } from "../../../quick-actions/useUpdateQuickActions";
import { useWorkflowsQuery } from "../../../workflows/queries";
import { QuickActionForm } from "../../widgets/QuickActionForm";
import { type SheetProps, geometry } from "./sheetTypes";

/**
 * Quick action detail: the stored task text and target, with an Edit button top-right that
 * swaps the body for the same form the widget's add row uses. Saving rewrites the whole list
 * (`PUT /api/quick-actions`) with this one action replaced.
 */
export function QuickActionSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const q = useTranslations("bridge.widgets.quickActions");
  const { data: actions } = useResolvedQuickActions();
  const { data: agents } = useAgentsQuery();
  const { data: workflows } = useWorkflowsQuery();
  const { update, pending } = useUpdateQuickActions(actions ?? []);
  const [editing, setEditing] = useState(false);

  const action = actions?.find((a) => a.id === id);
  if (!action) return null;

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      actions={
        editing || action.automationId ? null : (
          <SheetAction intent="primary" onClick={() => setEditing(true)}>
            {q("edit")}
          </SheetAction>
        )
      }
      chips={[
        action.target
          ? `${action.target.kind} · ${action.target.name ?? action.target.id}`
          : q("auto"),
      ]}
      closeLabel={t("bridge.sheet.close")}
      kind={t("bridge.widgets.quickActions.kind")}
      onClose={onClose}
      title={action.label}
    >
      {editing ? (
        <QuickActionForm
          agents={agents ?? []}
          initial={action}
          onCancel={() => setEditing(false)}
          onSubmit={(values) =>
            update(
              (latest) => latest.map((a) => (a.id === id ? { id, ...values } : a)),
              () => setEditing(false),
            )
          }
          pending={pending}
          submitLabel={q("save")}
          workflows={workflows ?? []}
        />
      ) : (
        <SheetSection>
          <SheetBlock label={q("text")}>
            <SheetText lines={action.text.split("\n")} />
          </SheetBlock>
        </SheetSection>
      )}
    </AnchoredSheet>
  );
}
