"use client";

import { Button, Dialog, type IconName, Typography } from "@zibby/design-system";

export interface ConfirmDeleteDialogProps {
  /** Question headline, e.g. "Smazat agenta?". */
  title: string;
  /** Consequence sentence, e.g. "Opravdu smazat …? Tuto akci nelze vrátit.". */
  body: string;
  /** The danger action's label (callers pass their catalog's delete string). */
  confirmLabel: string;
  cancelLabel: string;
  /** Danger-button glyph; sections historically use "trash" or "x". */
  icon?: IconName;
  /** Disables double-fire while the delete mutation runs. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one confirm-delete dialog (NC1) — grammar: dialogs confirm; deletes always
 * ask. Extracted from the 8 byte-identical copies the N4 detail pages grew
 * (agents, skills, commands, hooks, mcp, automations, integrations, projects):
 * a small Dialog with a ghost Cancel and a danger Confirm, closing = cancelling.
 */
export function ConfirmDeleteDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  icon = "trash",
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button icon={icon} intent="danger" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
      onClose={onCancel}
      title={title}
      width="sm"
    >
      <Typography size="base" type="note" variant="secondary">
        {body}
      </Typography>
    </Dialog>
  );
}
