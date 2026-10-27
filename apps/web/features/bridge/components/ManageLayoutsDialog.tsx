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
import { type DragEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { type Arrangement, DEFAULT_PRESET, layoutNameError } from "../grid/presets";

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

/**
 * Flat index (name removed) to insert before `target` (a name, DIVIDER, or null = very end).
 * Dropping on the divider crosses it: a shown row lands first in hidden, a hidden row last in shown.
 */
function dropIndex(arr: Arrangement, name: string, target: string | null): number {
  const flat = [...arr.shown, DIVIDER, ...arr.hidden].filter((n) => n !== name);
  if (target === DIVIDER && arr.shown.includes(name)) return flat.indexOf(DIVIDER) + 1;
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
  onDelete: (name: string) => void;
  onClose: () => void;
}

/** Manage the Bridge layouts: reorder (drag and drop), header vs dropdown, delete, add. */
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
  const label = (n: string) => (n === DEFAULT_PRESET || n === "REVIEW" ? t(`preset.${n}`) : n);

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

  // Rows remount when they cross the divider, so the moved row is re-focused after the render.
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (!refocus.current) return;
    document
      .querySelector<HTMLElement>(
        `[data-testid="${ManageLayoutsDialogTestId.Row}-${refocus.current}"]`,
      )
      ?.focus();
    refocus.current = null;
  });
  const key = (e: KeyboardEvent, n: string) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const cur = [...layouts.shown, DIVIDER, ...layouts.hidden].indexOf(n);
    refocus.current = n;
    onArrange(moveLayout(layouts, n, cur + (e.key === "ArrowUp" ? -1 : 1)));
  };

  const row = (n: string) => (
    <div
      draggable
      aria-description={t("manage.moveHint")}
      data-testid={`${ManageLayoutsDialogTestId.Row}-${n}`}
      key={n}
      onDragOver={over}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(LAYOUT_DND_TYPE, n);
      }}
      onDrop={(e) => drop(e, n)}
      onKeyDown={(e) => key(e, n)}
      tabIndex={0}
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
          {n === DEFAULT_PRESET ? null : (
            <div data-testid={`${ManageLayoutsDialogTestId.Delete}-${n}`}>
              <ConfirmDeleteButton
                ariaLabel={t("manage.deleteNamed", { name: label(n) })}
                confirmLabel={t("deleteLayoutConfirm")}
                label={t("deleteLayout")}
                onConfirm={() => onDelete(n)}
              />
            </div>
          )}
        </Stack>
      </Panel>
    </div>
  );

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
