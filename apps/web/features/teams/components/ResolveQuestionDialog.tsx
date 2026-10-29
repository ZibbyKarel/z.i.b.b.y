"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { TeamKbDigestItem } from "@zibby/contracts";
import { Button, Dialog, TextAreaField, Typography } from "@zibby/design-system";
import { DialogTitle } from "../../../components/DialogTitle/DialogTitle";
import { useResolveTeamKbQuestionMutation } from "../mutations";

export enum ResolveQuestionDialogTestId {
  Answer = "resolve-question-answer",
  Submit = "resolve-question-submit",
  Error = "resolve-question-error",
}

export interface ResolveQuestionDialogProps {
  teamId: string;
  item: TeamKbDigestItem;
  onClose: () => void;
}

/** "Resolve question" dialog of the Team-KB widget: the typed answer becomes an inbox note. */
export function ResolveQuestionDialog({ teamId, item, onClose }: ResolveQuestionDialogProps) {
  const t = useTranslations("bridge.widgets.teamKb");
  const tk = useTranslations();
  const resolve = useResolveTeamKbQuestionMutation(teamId);
  const [answer, setAnswer] = useState("");

  const canSubmit = answer.trim() !== "" && !resolve.isPending;
  const status =
    typeof resolve.error === "object" && resolve.error !== null && "status" in resolve.error
      ? resolve.error.status
      : undefined;
  const errorText = resolve.error
    ? status === 404
      ? t("resolveDialog.notFound")
      : status === 409
        ? t("resolveDialog.conflict")
        : t("resolveDialog.failed")
    : null;

  function submit() {
    if (!canSubmit) return;
    resolve.mutate(
      { params: { id: teamId }, body: { noteId: item.noteId, question: item.text, answer } },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {tk("common.cancel")}
          </Button>
          <Button
            data-testid={ResolveQuestionDialogTestId.Submit}
            disabled={!canSubmit}
            icon="check"
            intent="primary"
            onClick={submit}
          >
            {t("resolveDialog.submit")}
          </Button>
        </>
      }
      ariaLabel={t("resolveDialog.title")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={
        <DialogTitle
          glyph="check"
          subtitle={t("resolveDialog.subtitle", { note: item.noteTitle })}
          title={t("resolveDialog.title")}
        />
      }
      width="sm"
    >
      <Typography type="body">{item.text}</Typography>
      <TextAreaField
        autoFocus
        data-testid={ResolveQuestionDialogTestId.Answer}
        label={t("resolveDialog.answer")}
        onChange={(e) => setAnswer(e.target.value)}
        rows={6}
        value={answer}
      />
      {errorText ? (
        <Typography
          data-testid={ResolveQuestionDialogTestId.Error}
          role="alert"
          size="sm"
          tone="bad"
          type="note"
        >
          {errorText}
        </Typography>
      ) : null}
    </Dialog>
  );
}
