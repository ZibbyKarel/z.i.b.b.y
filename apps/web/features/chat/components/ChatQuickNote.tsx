"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Container,
  GlassSurface,
  Icon,
  Pressable,
  Stack,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import { useCreateNoteMutation } from "../../memory/mutations";

export enum ChatQuickNoteTestId {
  Root = "chat-quick-note",
  Body = "chat-quick-note-body",
  Save = "chat-quick-note-save",
  Close = "chat-quick-note-close",
}

export interface ChatQuickNoteProps {
  onClose: () => void;
  /** Called with the created note's id, mirroring `QuickCapture`'s `onCaptured`. */
  onSaved?: (id: string) => void;
}

/**
 * A short timestamp-based slug for a note with no title — mirrors
 * `QuickCapture`'s `untitledId()`. `VcQuickNote` has no title field at all, so
 * every note this composer creates takes this path.
 */
function untitledId(): string {
  return `capture-${Date.now().toString(36)}`;
}

/**
 * Velín-D bottom-bar "add a note" composer (`VcQuickNote`) — the chat sibling of
 * memory's {@link QuickCapture}, minus the title field, wrapped in
 * {@link GlassSurface} instead of a plain `Stack`. Reuses the same create-note
 * flow: `useCreateNoteMutation()` omits `tier` so the server defaults it to
 * `knowledge` + `raw:true`, letting the nightly triage sweep sort it out later.
 *
 * Standalone unit — the bottom bar (T4/T6) owns mount/unmount and the expand/
 * collapse choreography; this component only knows how to save a note and call
 * `onClose`.
 */
export function ChatQuickNote({ onClose, onSaved }: ChatQuickNoteProps) {
  const t = useTranslations("chat.note");
  const createMut = useCreateNoteMutation();

  const [body, setBody] = useState("");

  const canSave = body.trim().length > 0;

  const save = () => {
    const id = untitledId();
    createMut.mutate(
      { body: { id, body } },
      {
        onSuccess: () => {
          onSaved?.(id);
          onClose();
        },
      },
    );
  };

  return (
    <GlassSurface data-testid={ChatQuickNoteTestId.Root} radius="panel">
      <Container padding="200">
        <Stack gap="150">
          <Stack align="center" direction="row" gap="100">
            <Typography mono size="xs" tone="accent" type="note">
              {t("title")}
            </Typography>
            <Container grow />
            <Pressable
              aria-label={t("close")}
              data-testid={ChatQuickNoteTestId.Close}
              onClick={onClose}
              title={t("close")}
            >
              <Icon name="x" size="xs" />
            </Pressable>
          </Stack>
          <TextAreaField
            autoFocus
            data-testid={ChatQuickNoteTestId.Body}
            label={t("bodyLabel")}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("placeholder")}
            rows={3}
            value={body}
          />
          <Button
            block
            data-testid={ChatQuickNoteTestId.Save}
            disabled={!canSave}
            icon="check"
            loading={createMut.isPending}
            onClick={save}
          >
            {t("save")}
          </Button>
        </Stack>
      </Container>
    </GlassSurface>
  );
}
