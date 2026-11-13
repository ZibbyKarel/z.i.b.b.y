"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ChatDock, Container, Dropdown, MarkdownEditor, Stack } from "@zibby/design-system";
import { toastBus } from "../../../components/Toaster/toastBus";
import { useIsPhone } from "../../../hooks/useIsPhone";
import { slug } from "../../../utils/slug";
import { VoiceStatusStrip, VoiceToggleButton, useVoiceMode } from "../../chat";
import { useCreateTeamKbNoteMutation, useTeamsQuery } from "../../teams";
import { useCreateNoteMutation } from "../mutations";

export enum NoteDockTestId {
  Target = "note-dock-target",
  Save = "note-dock-save",
}

/** Save target for the personal vault; team ids are slugs, so "@" never collides. */
export const NOTE_TARGET_VAULT = "@vault";

const TITLE_MAX = 80;

/** First non-blank line, leading `#`s / whitespace stripped, capped at 80 chars; "" if none. */
export function noteTitle(markdown: string): string {
  const line = markdown.split("\n").find((l) => l.trim()) ?? "";
  return line
    .replace(/^[\s#]+/, "")
    .trim()
    .slice(0, TITLE_MAX);
}

export interface NoteDockProps {
  open: boolean;
  onClose: () => void;
}

/**
 * A markdown note window (DS `ChatDock` frame) with dictation. Stays mounted and returns
 * `null` when closed so the draft survives Esc/close; saves to the vault or a team KB.
 */
export function NoteDock({ open, onClose }: NoteDockProps) {
  const t = useTranslations("memory");
  const phone = useIsPhone();
  const { data: teams } = useTeamsQuery();
  const createNote = useCreateNoteMutation();
  const createKbNote = useCreateTeamKbNoteMutation();
  const [body, setBody] = useState("");
  const [target, setTarget] = useState(NOTE_TARGET_VAULT);

  const voice = useVoiceMode({
    onFinal: (text) => setBody((b) => (b.trim() ? `${b.trimEnd()} ${text}` : text)),
  });
  const voiceOff = voice.off;
  useEffect(() => {
    if (!open) voiceOff();
  }, [open, voiceOff]);

  if (!open) return null;

  const options = [
    { value: NOTE_TARGET_VAULT, label: t("noteDock.vault") },
    ...(teams ?? [])
      .filter((team) => team.knowledgeBase)
      .map((team) => ({ value: team.id, label: team.name })),
  ];
  const pending = createNote.isPending || createKbNote.isPending;

  const save = () => {
    const title = noteTitle(body) || t("noteDock.untitled");
    const callbacks = {
      onSuccess: () => {
        setBody("");
        toastBus.emit({ severity: "ok", message: t("noteDock.saved") });
        onClose();
      },
    };
    if (target === NOTE_TARGET_VAULT) {
      const id = `${slug(title, { fallback: "note", maxLength: 100 })}-${Date.now().toString(36)}`;
      createNote.mutate({ body: { id, title, body } }, callbacks);
    } else {
      createKbNote.mutate({ params: { id: target }, body: { title, body } }, callbacks);
    }
  };

  const composer = (
    <Stack align="stretch" direction="col" gap="100">
      {voice.active && (
        <VoiceStatusStrip
          interim={voice.interim}
          listening={voice.listening}
          transcribing={voice.transcribing}
        />
      )}
      <Stack align="center" direction="row" gap="100" justify="between">
        <Container data-testid={NoteDockTestId.Target}>
          <Dropdown
            aria-label={t("noteDock.target")}
            onChange={setTarget}
            options={options}
            size="sm"
            value={target}
            variant="inline"
          />
        </Container>
        {voice.supported && <VoiceToggleButton active={voice.active} onToggle={voice.toggle} />}
        <Button
          data-testid={NoteDockTestId.Save}
          disabled={!body.trim() || pending}
          intent="primary"
          loading={pending}
          onClick={save}
          size="sm"
        >
          {t("noteDock.save")}
        </Button>
      </Stack>
    </Stack>
  );

  return (
    <ChatDock
      open
      closeLabel={t("noteDock.close")}
      compact={phone}
      composer={composer}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      transcript={
        <MarkdownEditor
          ariaLabel={t("noteDock.editorLabel")}
          onChange={setBody}
          placeholder={t("noteDock.placeholder")}
          value={body}
        />
      }
    />
  );
}
