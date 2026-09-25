"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Stack, TextAreaField, TextInputField } from "@zibby/design-system";
import { useCreateNoteMutation } from "../mutations";
import { slug } from "../../../utils/slug";

export enum QuickCaptureTestId {
  Root = "memory-note-quickcapture",
  Title = "memory-note-quickcapture-title",
  Body = "memory-note-quickcapture-body",
  Save = "memory-note-quickcapture-save",
  Cancel = "memory-note-quickcapture-cancel",
}

export interface QuickCaptureProps {
  onClose: () => void;
  /** Called with the created note's id so the screen can select it (mirrors NoteEditorDialog). */
  onCaptured: (id: string) => void;
}

/**
 * A short timestamp-based slug for a capture with no title to derive an id from —
 * base36 keeps it compact. Two captures landing in the exact same millisecond would
 * collide, but that just surfaces as the API's normal duplicate-id rejection; a title
 * is the common case anyway (see the id auto-slug below).
 */
function untitledId(): string {
  return `capture-${Date.now().toString(36)}`;
}

/**
 * The zero-friction "halda" quick-capture path (Phase 109, decision 1): a SECOND,
 * lighter-weight create affordance that sits ALONGSIDE the full {@link NoteEditorDialog}
 * flow on the memory {@link Screen} — not in place of it. Curated notes with an
 * explicit tier still reach for the full form; this one is for "just dump it
 * somewhere" — no tier/type picker at all. Rendered inline (not a dialog): there's
 * nothing to confirm beyond the text itself, and a modal would add friction to
 * exactly the flow meant to have none.
 *
 * The create call OMITS `tier`, so the server defaults it to `knowledge` and forces
 * `raw: true` (phases 105/107) — the nightly triage sweep sorts it out later. The id
 * auto-slugs from the title when there is one (mirrors `NoteEditorDialog`'s
 * title→id slug), else falls back to a timestamp-based slug.
 */
export function QuickCapture({ onClose, onCaptured }: QuickCaptureProps) {
  const t = useTranslations("memory");
  const tk = useTranslations();
  const createMut = useCreateNoteMutation();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const canSave = body.trim().length > 0;

  const capture = () => {
    const id = title.trim() ? slug(title, "note") : untitledId();
    createMut.mutate(
      { body: { id, title: title.trim() || undefined, body } },
      {
        onSuccess: () => {
          onCaptured(id);
          onClose();
        },
      },
    );
  };

  return (
    <Stack data-testid={QuickCaptureTestId.Root} gap="150">
      <TextInputField
        autoFocus
        data-testid={QuickCaptureTestId.Title}
        label={t("quickCapture.titleLabel")}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("quickCapture.titlePlaceholder")}
        value={title}
      />
      <TextAreaField
        data-testid={QuickCaptureTestId.Body}
        label={t("quickCapture.bodyLabel")}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("quickCapture.bodyPlaceholder")}
        rows={3}
        value={body}
      />
      <Stack align="center" direction="row" gap="100" justify="end">
        <Button data-testid={QuickCaptureTestId.Cancel} intent="ghost" onClick={onClose} size="sm">
          {tk("common.cancel")}
        </Button>
        <Button
          data-testid={QuickCaptureTestId.Save}
          disabled={!canSave}
          icon="bolt"
          loading={createMut.isPending}
          onClick={capture}
          size="sm"
        >
          {t("quickCapture.save")}
        </Button>
      </Stack>
    </Stack>
  );
}
