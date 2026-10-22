"use client";

import {
  Button,
  ConfirmDeleteButton,
  Dialog,
  Divider,
  Panel,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type DragEvent, useId, useState } from "react";
import { type Arrangement, layoutNameError } from "../grid/presets";

/** Drag-data MIME carrying the dragged layout's name. */
const LAYOUT_DND_TYPE = "application/x-zibby-bridge-layout";
/** Stand-in for the divider in the flat `[...shown, DIVIDER, ...hidden]` sequence. */
const DIVIDER = "\u0000divider";

export enum ManageLayoutsDialogTestId {
  /** One layout row — suffixed with its name: `manage-layouts-row-REVIEW`. */
  Row = "manage-layouts-row",
  Divider = "manage-layouts-divider",
  DropShown = "manage-layouts-drop-shown",
  DropHidden = "manage-layouts-drop-hidden",
  /** Thin zone after the last hidden row: appends to the end of the dropdown. */
  DropEnd = "manage-layouts-drop-end",
  /** Suffixed with the layout name. */
  Up = "manage-layouts-up",
  Down = "manage-layouts-down",
  Edit = "manage-layouts-edit",
  Delete = "manage-layouts-delete",
  Input = "manage-layouts-input",
  Add = "manage-layouts-add",
}

/**
 * Moves `name` so it lands at `toIndex` of the flat `[...shown, DIVIDER, ...hidden]` sequence
 * *with `name` removed* (so `indexOf(target)` there means "insert before target").
 */
export function moveLayout(arr: Arrangement, name: string, toIndex: number): Arrangement {
  const flat = [...arr.shown, DIVIDER, ...arr.hidden].filter((n) => n !== name);
  flat.splice(Math.max(0, Math.min(toIndex, flat.length)), 0, name);
  const d = flat.indexOf(DIVIDER);
  return { shown: flat.slice(0, d), hidden: flat.slice(d + 1) };
}

/** Moves `name` one step up (-1) or down (+1) in the flat sequence; crossing the divider swaps sides. */
export function stepLayout(arr: Arrangement, name: string, step: -1 | 1): Arrangement {
  const cur = [...arr.shown, DIVIDER, ...arr.hidden].indexOf(name);
  return cur < 0 ? arr : moveLayout(arr, name, cur + step);
}

/** Flat index (name removed) to insert before `target` (a name, DIVIDER, or null = very end). */
function dropIndex(arr: Arrangement, name: string, target: string | null): number {
  const flat = [...arr.shown, DIVIDER, ...arr.hidden].filter((n) => n !== name);
  return target === null ? flat.length : flat.indexOf(target);
}

export interface ManageLayoutsDialogProps {
  open: boolean;
  /** Active layout. */
  preset: string;
  layouts: Arrangement;
  /** Next free `MY LAYOUT NN`. */
  nextName: string;
  /** Saved layout names (for the duplicate check). */
  saved: Readonly<Record<string, unknown>>;
  onArrange: (next: Arrangement) => void;
  /** Returns false when the name is rejected. */
  onAdd: (name: string) => boolean;
  onEdit: (name: string) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}

/** Manage the Bridge layouts: reorder (drag or arrows), header vs dropdown, edit, delete, add. */
export function ManageLayoutsDialog({ open, ...rest }: ManageLayoutsDialogProps) {
  return open ? <ManageLayouts {...rest} /> : null;
}

function ManageLayouts({
  preset,
  layouts,
  nextName,
  saved,
  onArrange,
  onAdd,
  onEdit,
  onDelete,
  onClose,
}: Omit<ManageLayoutsDialogProps, "open">) {
  const t = useTranslations("bridge");
  const tc = useTranslations("common");
  const formId = useId();
  const [name, setName] = useState(nextName);
  const [submitted, setSubmitted] = useState(false);
  const err = layoutNameError(name, saved);

  // Re-sync the input when the next free name changes (after a successful add).
  const [seenNext, setSeenNext] = useState(nextName);
  if (seenNext !== nextName) {
    setSeenNext(nextName);
    setName(nextName);
    setSubmitted(false);
  }

  const flat = [...layouts.shown, ...layouts.hidden];
  const label = (n: string) => (n === "REVIEW" ? t("preset.REVIEW") : n);

  const drop = (e: DragEvent, target: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const dragged = e.dataTransfer.getData(LAYOUT_DND_TYPE);
    if (!dragged || dragged === target || !flat.includes(dragged)) return;
    onArrange(moveLayout(layouts, dragged, dropIndex(layouts, dragged, target)));
  };
  const over = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(LAYOUT_DND_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const row = (n: string) => {
    return (
      <div
        draggable
        data-testid={`${ManageLayoutsDialogTestId.Row}-${n}`}
        key={n}
        onDragOver={over}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(LAYOUT_DND_TYPE, n);
        }}
        onDrop={(e) => drop(e, n)}
      >
        <Panel padding="100">
          <Stack align="center" direction="row" gap="100">
            <Typography aria-hidden mono type="note" variant="tertiary">
              ⠿
            </Typography>
            <Stack grow direction="row" gap="75">
              <Typography mono size="sm" type="note">
                {label(n)}
              </Typography>
              {n === preset ? (
                <Typography mono size="2xs" type="note" variant="tertiary">
                  {t("manage.active")}
                </Typography>
              ) : null}
            </Stack>
            <Button
              aria-label={t("manage.moveUp", { name: label(n) })}
              data-testid={`${ManageLayoutsDialogTestId.Up}-${n}`}
              disabled={layouts.shown[0] === n}
              intent="ghost"
              onClick={() => onArrange(stepLayout(layouts, n, -1))}
              size="sm"
            >
              ↑
            </Button>
            <Button
              aria-label={t("manage.moveDown", { name: label(n) })}
              data-testid={`${ManageLayoutsDialogTestId.Down}-${n}`}
              disabled={layouts.hidden.at(-1) === n}
              intent="ghost"
              onClick={() => onArrange(stepLayout(layouts, n, 1))}
              size="sm"
            >
              ↓
            </Button>
            <Button
              aria-label={t("manage.editNamed", { name: label(n) })}
              data-testid={`${ManageLayoutsDialogTestId.Edit}-${n}`}
              intent="ghost"
              onClick={() => onEdit(n)}
              size="sm"
            >
              {t("manage.edit")}
            </Button>
            <div data-testid={`${ManageLayoutsDialogTestId.Delete}-${n}`}>
              <ConfirmDeleteButton
                ariaLabel={t("manage.deleteNamed", { name: label(n) })}
                confirmLabel={t("deleteLayoutConfirm")}
                label={t("deleteLayout")}
                onConfirm={() => onDelete(n)}
              />
            </div>
          </Stack>
        </Panel>
      </div>
    );
  };

  const emptyZone = (testId: ManageLayoutsDialogTestId, target: string | null, text: string) => (
    <div data-testid={testId} onDragOver={over} onDrop={(e) => drop(e, target)}>
      <Panel padding="100">
        <Typography mono size="2xs" type="note" variant="tertiary">
          {text}
        </Typography>
      </Panel>
    </div>
  );

  return (
    <Dialog open closeLabel={tc("close")} onClose={onClose} title={t("manage.title")} width="lg">
      <Stack gap="150">
        <Stack gap="75">
          <Panel padding="100">
            <Typography mono size="sm" type="note">
              {t("preset.DEFAULT")}
              {preset === "DEFAULT" ? ` · ${t("manage.active")}` : ""}
            </Typography>
          </Panel>
          {layouts.shown.length === 0
            ? emptyZone(ManageLayoutsDialogTestId.DropShown, DIVIDER, t("manage.dropShown"))
            : layouts.shown.map(row)}
          <div
            data-testid={ManageLayoutsDialogTestId.Divider}
            onDragOver={over}
            onDrop={(e) => drop(e, DIVIDER)}
          >
            <Stack gap="25">
              <Divider />
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("manage.divider")}
              </Typography>
            </Stack>
          </div>
          {layouts.hidden.length === 0
            ? emptyZone(ManageLayoutsDialogTestId.DropHidden, null, t("manage.dropHidden"))
            : layouts.hidden.map(row)}
          {layouts.hidden.length > 0 ? (
            <div
              data-testid={ManageLayoutsDialogTestId.DropEnd}
              onDragOver={over}
              onDrop={(e) => drop(e, null)}
            >
              <Typography mono size="2xs" type="note" variant="tertiary">
                {t("manage.dropEnd")}
              </Typography>
            </div>
          ) : null}
        </Stack>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (err || !onAdd(name.trim())) return;
            setName(nextName);
            setSubmitted(false);
          }}
        >
          <Stack align="end" direction="row" gap="100">
            <Stack grow>
              <TextInputField
                data-testid={ManageLayoutsDialogTestId.Input}
                error={submitted && err ? t(`layoutNameError.${err}`) : undefined}
                label={t("manage.newName")}
                onChange={(e) => {
                  setName(e.target.value);
                  setSubmitted(false);
                }}
                value={name}
              />
            </Stack>
            <Button
              data-testid={ManageLayoutsDialogTestId.Add}
              intent="primary"
              size="sm"
              type="submit"
            >
              {t("manage.add")}
            </Button>
          </Stack>
        </form>
      </Stack>
    </Dialog>
  );
}
