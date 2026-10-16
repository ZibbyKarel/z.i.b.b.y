"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { InboxPr } from "@zibby/contracts";
import { Button, Checkbox, HoldButton, Row, Tag, TextLink, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useMergeProjectPrMutation } from "../../projects/mutations";
import { useReviewInboxPrMutation } from "../mutations";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";
import { NavLink } from "./links";

export enum PrActionsTestId {
  Review = "inbox-pr-review",
  ReviewStatus = "inbox-pr-review-status",
  Merge = "inbox-pr-merge",
  DeleteBranch = "inbox-pr-delete-branch",
  Message = "inbox-pr-action-message",
}

export interface PrActionsProps {
  pr: InboxPr;
}

/**
 * Phase 129 PR actions, each an explicit operator click:
 * - review sections → "Do code review" (a `code-reviewer` task; posting to GitHub
 *   waits on a Tier-3 approval) plus the latest review's state, linked to its task;
 * - `ready-to-merge` → hold-to-confirm "Squash and merge" (optionally deleting the
 *   head branch, on by default) through the existing project merge route.
 */
export function PrActions({ pr }: PrActionsProps) {
  const t = useTranslations("inboxPage.prs.actions");
  const qc = useQueryClient();
  const review = useReviewInboxPrMutation();
  const merge = useMergeProjectPrMutation();
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const reviewable = pr.section === "needs-your-review" || pr.section === "needs-team-review";
  const busy = pr.codeReview?.state === "running" || pr.codeReview?.state === "awaiting-approval";
  if (!reviewable && pr.section !== "ready-to-merge") return null;

  const onReview = () =>
    review.mutate(
      { body: { projectId: pr.projectId, repo: pr.repo, number: pr.number, title: pr.title } },
      {
        onSuccess: () => setMessage(t("reviewStarted")),
        onError: () => setMessage(t("reviewFailed")),
      },
    );

  const onMerge = () =>
    merge.mutate(
      {
        params: { id: pr.projectId, number: pr.number },
        body: { method: "squash", deleteBranch },
      },
      {
        onSuccess: (res) => {
          void qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
          setMessage(
            res.status === 200 && res.body.note ? t("mergedNote", { note: res.body.note }) : null,
          );
        },
        onError: () => setMessage(t("mergeFailed")),
      },
    );

  return (
    <Row wrap gap="150">
      {reviewable && (
        <Button
          data-testid={PrActionsTestId.Review}
          disabled={busy}
          intent="secondary"
          loading={review.isPending}
          onClick={onReview}
          size="sm"
        >
          {t("review")}
        </Button>
      )}
      {pr.codeReview && (
        <TextLink
          data-testid={PrActionsTestId.ReviewStatus}
          href={`/work/tasks/${encodeURIComponent(pr.codeReview.taskId)}`}
          linkComponent={NavLink}
        >
          <Tag uppercase tone={pr.codeReview.state === "failed" ? "bad" : "neutral"}>
            {t(`reviewState.${pr.codeReview.state}`)} →
          </Tag>
        </TextLink>
      )}
      {pr.section === "ready-to-merge" && (
        <>
          <HoldButton
            armedLabel={t("mergeArmed")}
            data-testid={PrActionsTestId.Merge}
            doneLabel={t("mergeDone")}
            label={t("merge")}
            onConfirm={onMerge}
            size="sm"
            tone="warn"
          />
          <Row gap="75">
            <Checkbox
              checked={deleteBranch}
              data-testid={PrActionsTestId.DeleteBranch}
              label={t("deleteBranch")}
              onChange={setDeleteBranch}
              size="sm"
            />
            <Typography type="label">{t("deleteBranch")}</Typography>
          </Row>
        </>
      )}
      {message && (
        <Typography data-testid={PrActionsTestId.Message} type="label" variant="secondary">
          {message}
        </Typography>
      )}
    </Row>
  );
}
