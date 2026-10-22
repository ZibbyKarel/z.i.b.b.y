"use client";

import type { InboxPr, PrReviewEvent } from "@zibby/contracts";
import {
  Button,
  Container,
  Dialog,
  DropDownButton,
  Stack,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useSubmitInboxPrReviewMutation } from "../mutations";

export enum PrReviewButtonTestId {
  Root = "inbox-pr-manual-review",
  Dialog = "inbox-pr-manual-review-dialog",
  Comment = "inbox-pr-manual-review-comment",
  Submit = "inbox-pr-manual-review-submit",
  Error = "inbox-pr-manual-review-error",
}

const EVENTS: readonly PrReviewEvent[] = ["APPROVE", "REQUEST_CHANGES", "COMMENT"];

export interface PrReviewButtonProps {
  pr: InboxPr;
}

/**
 * The operator's own GitHub review on someone else's PR: a split button picks the verdict
 * (approve / request changes / comment), the primary click opens a dialog for the optional
 * (approve) or required (otherwise) comment. Hidden on the operator's own PRs.
 */
export function PrReviewButton({ pr }: PrReviewButtonProps) {
  const t = useTranslations("inboxPage.prs.manualReview");
  const submit = useSubmitInboxPrReviewMutation();
  const [event, setEvent] = useState<PrReviewEvent>("APPROVE");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (pr.bucket === "mine") return null;

  const label = t(`event.${event}`);
  const trimmed = text.trim();
  const close = () => {
    setOpen(false);
    setError(null);
  };

  const onSubmit = () => {
    setError(null);
    submit.mutate(
      {
        params: { projectId: pr.projectId, number: pr.number },
        body: { event, body: trimmed || undefined },
      },
      {
        onSuccess: () => {
          close();
          setText("");
          setEvent("APPROVE");
        },
        onError: (err) =>
          setError("status" in err && err.status === 422 ? err.body.message : t("failed")),
      },
    );
  };

  return (
    <Container data-testid={PrReviewButtonTestId.Root}>
      <DropDownButton
        intent="secondary"
        label={label}
        menuAriaLabel={t("menuAria")}
        menuItems={EVENTS.map((e) => ({
          id: e,
          label: t(`event.${e}`),
          checked: e === event,
          onSelect: () => setEvent(e),
        }))}
        onClick={() => setOpen(true)}
        size="sm"
      />
      <Dialog
        actions={
          <>
            <Button intent="secondary" onClick={close} size="sm">
              {t("cancel")}
            </Button>
            <Button
              data-testid={PrReviewButtonTestId.Submit}
              disabled={submit.isPending || (event !== "APPROVE" && !trimmed)}
              intent="primary"
              loading={submit.isPending}
              onClick={onSubmit}
              size="sm"
            >
              {label}
            </Button>
          </>
        }
        onClose={close}
        open={open}
        title={t("dialogTitle", { event: label, number: pr.number })}
      >
        <Stack data-testid={PrReviewButtonTestId.Dialog} gap="100">
          <TextAreaField
            data-testid={PrReviewButtonTestId.Comment}
            hint={event === "APPROVE" ? t("optional") : t("required")}
            label={t("comment")}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            value={text}
          />
          {error && (
            <Typography
              data-testid={PrReviewButtonTestId.Error}
              role="alert"
              type="label"
              variant="secondary"
            >
              {error}
            </Typography>
          )}
        </Stack>
      </Dialog>
    </Container>
  );
}
