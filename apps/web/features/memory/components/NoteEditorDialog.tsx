"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  Dropdown,
  MarkdownEditor,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import type { MemoryTier, Note } from "@zibby/contracts";
import { useCreateNoteMutation, useUpdateNoteMutation } from "../mutations";
import { slug } from "../../../utils/slug";

export enum NoteEditorDialogTestId {
  Root = "note-editor-dialog",
  Title = "note-editor-title",
  Id = "note-editor-id",
  Tier = "note-editor-tier",
  Save = "note-editor-save",
}

export interface NoteEditorDialogProps {
  mode: "create" | "edit";
  /** The note to edit (edit mode only); the parent loads it before opening. */
  note?: Note;
  onClose: () => void;
  /** Called with the saved note's id so the screen can select it. */
  onSaved: (id: string) => void;
}

const TIERS: MemoryTier[] = ["memory", "daily", "knowledge"];

/** Slug a title into a filesystem-safe note id (matches the API's NoteIdSchema). */
const slugify = (s: string): string => slug(s, "note");

/**
 * Create or edit a vault note. Mounted fresh per open (the parent renders it only
 * while editing), so local state initialises from the passed note with no effect.
 * Create mode auto-slugs the id from the title (editable until first save); edit
 * mode shows id/tier read-only (immutable — there is no move op in Phase 4). The
 * body is the DS MarkdownEditor; frontmatter is assembled by the API.
 */
export function NoteEditorDialog({ mode, note, onClose, onSaved }: NoteEditorDialogProps) {
  const t = useTranslations("memory");
  const tk = useTranslations();
  const isEdit = mode === "edit";

  const createMut = useCreateNoteMutation();
  const updateMut = useUpdateNoteMutation();

  const [title, setTitle] = useState(note?.title ?? "");
  const [id, setId] = useState(note?.id ?? "");
  const [idDirty, setIdDirty] = useState(isEdit);
  const [tier, setTier] = useState<MemoryTier>(note?.tier ?? "knowledge");
  const [body, setBody] = useState(note?.body ?? "");

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (!isEdit && !idDirty) setId(slugify(value));
  };

  const pending = createMut.isPending || updateMut.isPending;
  const canSave = isEdit ? Boolean(note) : id.trim().length > 0;

  const save = () => {
    if (isEdit && note) {
      updateMut.mutate(
        { params: { id: note.id }, body: { title: title || undefined, body } },
        {
          onSuccess: () => {
            onSaved(note.id);
            onClose();
          },
        },
      );
      return;
    }
    const newId = id.trim();
    createMut.mutate(
      { body: { id: newId, tier, title: title || undefined, body } },
      {
        onSuccess: () => {
          onSaved(newId);
          onClose();
        },
      },
    );
  };

  const actions = (
    <Stack align="center" direction="row" gap="100" justify="end">
      <Button intent="ghost" onClick={onClose}>
        {tk("common.cancel")}
      </Button>
      <Button
        data-testid={NoteEditorDialogTestId.Save}
        disabled={!canSave}
        icon={isEdit ? "check" : "plus"}
        loading={pending}
        onClick={save}
      >
        {t("save")}
      </Button>
    </Stack>
  );

  return (
    <Dialog
      open
      actions={actions}
      ariaLabel={isEdit ? t("editNote") : t("newNote")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={isEdit ? t("editNote") : t("newNote")}
      width="lg"
    >
      <Stack data-testid={NoteEditorDialogTestId.Root} gap="200">
        <TextInputField
          autoFocus
          data-testid={NoteEditorDialogTestId.Title}
          label={t("titleLabel")}
          onChange={(e) => onTitleChange(e.target.value)}
          value={title}
        />

        {isEdit ? (
          <Typography mono size="caption" type="note" variant="tertiary">
            {id} · {tier}
          </Typography>
        ) : (
          <Stack gap="150">
            <TextInputField
              data-testid={NoteEditorDialogTestId.Id}
              hint={t("idHint")}
              label={t("idLabel")}
              onChange={(e) => {
                setIdDirty(true);
                setId(e.target.value);
              }}
              value={id}
            />
            <Stack data-testid={NoteEditorDialogTestId.Tier} gap="75">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("tierLabel")}
              </Typography>
              <Dropdown<MemoryTier>
                aria-label={t("tierLabel")}
                onChange={setTier}
                options={TIERS.map((value) => ({ value, label: t(`tier.${value}`) }))}
                value={tier}
                variant="field"
              />
            </Stack>
          </Stack>
        )}

        <MarkdownEditor
          ariaLabel={t("bodyLabel")}
          label={t("bodyLabel")}
          onChange={(value) => setBody(value ?? "")}
          value={body}
        />
      </Stack>
    </Dialog>
  );
}
