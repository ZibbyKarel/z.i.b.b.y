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
import type { MemoryTier } from "@zibby/contracts";
import { useCreateNoteMutation } from "../mutations";
import { slug } from "../../../utils/slug";

export enum NoteEditorDialogTestId {
  Root = "note-editor-dialog",
  Title = "note-editor-title",
  Id = "note-editor-id",
  Tier = "note-editor-tier",
  Save = "note-editor-save",
}

export interface NoteEditorDialogProps {
  onClose: () => void;
  /** Called with the created note's id so the screen can select it. */
  onSaved: (id: string) => void;
}

const TIERS: MemoryTier[] = ["memory", "daily", "knowledge"];

/** Slug a title into a filesystem-safe note id (matches the API's NoteIdSchema). */
const slugify = (s: string): string => slug(s, "note");

/**
 * The CREATE-ONLY vault note dialog (N4g) — grammar: dialogs create and
 * confirm, nothing else. Editing an existing note happens IN PLACE on the note
 * panel ({@link NoteView}'s view⇄edit toggle). The id auto-slugs from the title
 * (editable until first save); the body is the DS MarkdownEditor; frontmatter
 * is assembled by the API.
 */
export function NoteEditorDialog({ onClose, onSaved }: NoteEditorDialogProps) {
  const t = useTranslations("memory");
  const tk = useTranslations();

  const createMut = useCreateNoteMutation();

  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idDirty, setIdDirty] = useState(false);
  const [tier, setTier] = useState<MemoryTier>("knowledge");
  const [body, setBody] = useState("");

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (!idDirty) setId(slugify(value));
  };

  const canSave = id.trim().length > 0;

  const save = () => {
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
        icon="plus"
        loading={createMut.isPending}
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
      ariaLabel={t("newNote")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={t("newNote")}
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
