"use client";

import { useState } from "react";
import {
  Button,
  Chip,
  Markdown,
  MarkdownEditor,
  Pressable,
  Stack,
  Tag,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { Note } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useUpdateNoteMutation } from "../mutations";

export enum NoteViewTestId {
  Edit = "memory-note-edit",
  Save = "memory-note-save",
  Cancel = "memory-note-cancel",
  Title = "memory-note-title-input",
  /** Phase 109: shown when the open note is unprocessed "halda" (`raw: true`). */
  RawBadge = "memory-note-raw-badge",
}

export interface NoteViewProps {
  /** The open note, or undefined when nothing is selected. */
  note: Note | undefined;
  /** Navigate to a linked/backlinked note (index-first traversal). */
  onSelect: (id: string) => void;
}

/** A row of clickable wiki-link chips — the index-first navigation affordance. */
function LinkChips({
  ids,
  kind,
  onSelect,
}: {
  ids: readonly string[];
  kind: "link" | "backlink";
  onSelect: (id: string) => void;
}) {
  return (
    <Stack wrap align="center" direction="row" gap="50">
      {ids.map((id) => (
        <Pressable data-testid={`memory-note-${kind}-${id}`} key={id} onClick={() => onSelect(id)}>
          <Chip tone="idle">{id}</Chip>
        </Pressable>
      ))}
    </Stack>
  );
}

/**
 * The memory note panel — a view⇄edit surface (N4g grammar: editing a large
 * Markdown body happens IN PLACE, not in a dialog; dialogs only create). View
 * mode shows the body plus its **navigable** wiki-links — outbound `links` (→)
 * and inbound `backlinks` (←), each a clickable chip that selects that note
 * (the index-first navigation the North Star describes). The Edit action sits
 * top-right in the panel header; edit mode swaps the body for a title input +
 * Markdown editor and Save/Cancel take the header slot. Id and tier stay
 * immutable (there is no move op).
 */
export function NoteView({ note, onSelect }: NoteViewProps) {
  const t = useTranslations("memory");
  const tk = useTranslations();
  const updateNote = useUpdateNoteMutation();

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const startEdit = () => {
    if (!note) return;
    setTitle(note.title ?? "");
    setBody(note.body ?? "");
    setEditing(true);
  };

  const save = () => {
    if (!note) return;
    updateNote.mutate(
      { params: { id: note.id }, body: { title: title || undefined, body } },
      { onSuccess: () => setEditing(false) },
    );
  };

  const action = note ? (
    editing ? (
      <Stack align="center" direction="row" gap="100">
        <Button
          data-testid={NoteViewTestId.Cancel}
          intent="ghost"
          onClick={() => setEditing(false)}
          size="sm"
        >
          {tk("common.cancel")}
        </Button>
        <Button
          data-testid={NoteViewTestId.Save}
          icon="check"
          intent="primary"
          loading={updateNote.isPending}
          onClick={save}
          size="sm"
        >
          {t("save")}
        </Button>
      </Stack>
    ) : (
      <Button
        data-testid={NoteViewTestId.Edit}
        icon="edit"
        intent="ghost"
        onClick={startEdit}
        size="sm"
      >
        {t("editNote")}
      </Button>
    )
  ) : undefined;

  return (
    <HudPanel action={action} padding="250" title={note?.title ?? t("noteFallback")}>
      {note ? (
        editing ? (
          <Stack gap="150">
            <Typography mono size="caption" type="note" variant="tertiary">
              {note.path} · {note.tier}
            </Typography>
            <TextInputField
              data-testid={NoteViewTestId.Title}
              label={t("titleLabel")}
              onChange={(e) => setTitle(e.target.value)}
              value={title}
            />
            <MarkdownEditor
              ariaLabel={t("bodyLabel")}
              label={t("bodyLabel")}
              onChange={(value) => setBody(value ?? "")}
              value={body}
            />
          </Stack>
        ) : (
          <Stack gap="150">
            <Stack align="center" direction="row" gap="75">
              <Typography mono size="caption" type="note" variant="tertiary">
                {note.path} · {note.tier}
              </Typography>
              {note.raw && (
                <Tag data-testid={NoteViewTestId.RawBadge} size="sm" tone="warn">
                  {t("untriaged")}
                </Tag>
              )}
            </Stack>

            <Markdown source={note.body ?? ""} />

            {note.links.length > 0 && (
              <Stack gap="50">
                <Typography
                  mono
                  uppercase
                  size="2xs"
                  tracking="wide"
                  type="note"
                  variant="tertiary"
                >
                  {t("noteLinks")}
                </Typography>
                <LinkChips ids={note.links} kind="link" onSelect={onSelect} />
              </Stack>
            )}

            {note.backlinks && note.backlinks.length > 0 && (
              <Stack gap="50">
                <Typography
                  mono
                  uppercase
                  size="2xs"
                  tracking="wide"
                  type="note"
                  variant="tertiary"
                >
                  {t("noteBacklinks")}
                </Typography>
                <LinkChips ids={note.backlinks} kind="backlink" onSelect={onSelect} />
              </Stack>
            )}
          </Stack>
        )
      ) : (
        <Typography mono size="sm" type="note" variant="secondary">
          {t("selectNode")}
        </Typography>
      )}
    </HudPanel>
  );
}
