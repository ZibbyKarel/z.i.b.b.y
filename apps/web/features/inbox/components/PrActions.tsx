"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { InboxPr, PrReviewLevel } from "@zibby/contracts";
import {
  Button,
  Checkbox,
  Container,
  DropDownButton,
  HoldButton,
  Row,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useMergeProjectPrMutation } from "../../projects/mutations";
import { useRebaseInboxPrMutation, useReviewInboxPrMutation } from "../mutations";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";
import { NavLink } from "./links";

export enum PrActionsTestId {
  Review = "inbox-pr-review",
  ReviewStatus = "inbox-pr-review-status",
  Rebase = "inbox-pr-rebase",
  RebaseStatus = "inbox-pr-rebase-status",
  Merge = "inbox-pr-merge",
  DeleteBranch = "inbox-pr-delete-branch",
  Message = "inbox-pr-action-message",
}

const isReviewable = (pr: InboxPr) =>
  pr.section === "needs-your-review" || pr.section === "needs-team-review";

/** todo-11 — my own PR whose head is conflicting with (or, per GitHub, behind) its base. */
const isRebaseable = (pr: InboxPr) =>
  pr.bucket === "mine" && (pr.mergeable === false || pr.behind === true);

/** Whether `PrActions` renders anything for this PR. */
export const hasPrActions = (pr: InboxPr) =>
  isReviewable(pr) ||
  pr.section === "ready-to-merge" ||
  isRebaseable(pr) ||
  pr.rebase !== undefined;

export interface PrActionsProps {
  pr: InboxPr;
}

/**
 * Phase 129 PR actions, each an explicit operator click:
 * - review sections → split "code review" button: the primary click runs a quick
 *   `code-reviewer` review, the menu offers thorough / with tests (pr-review-* workflows).
 *   Posting to GitHub waits on a Tier-3 approval. Plus the latest review's state,
 *   linked to its task;
 * - `ready-to-merge` → hold-to-confirm "Squash and merge" (optionally deleting the
 *   head branch, on by default) through the existing project merge route;
 * - my PR behind / conflicting with its base → "Rebase" (todo-11): a `pr-rebase` task. ZIBBY
 *   force-pushes with lease, and the push is gated (Tier-3) when the agent resolved
 *   conflicts. Plus the latest rebase's state, linked to its task;
 */
export function PrActions({ pr }: PrActionsProps) {
  const t = useTranslations("inboxPage.prs.actions");
  const qc = useQueryClient();
  const review = useReviewInboxPrMutation();
  const merge = useMergeProjectPrMutation();
  const rebase = useRebaseInboxPrMutation();
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const reviewable = isReviewable(pr);
  const busy = pr.codeReview?.state === "running" || pr.codeReview?.state === "awaiting-approval";
  const rebaseBusy = pr.rebase?.state === "running" || pr.rebase?.state === "awaiting-approval";
  if (!hasPrActions(pr)) return null;

  const onReview = (level: PrReviewLevel) =>
    review.mutate(
      {
        body: {
          projectId: pr.projectId,
          repo: pr.repo,
          number: pr.number,
          title: pr.title,
          level,
        },
      },
      {
        // The row's status link ("Review běží →") already reports the started review
        // once the list refetches — no second "started" message beside it.
        onSuccess: () => setMessage(null),
        onError: () => setMessage(t("reviewFailed")),
      },
    );

  const onRebase = () =>
    rebase.mutate(
      { body: { projectId: pr.projectId, repo: pr.repo, number: pr.number, title: pr.title } },
      {
        // The status link ("Rebase běží →") reports the started rebase once the list refetches.
        onSuccess: () => setMessage(null),
        onError: (err) =>
          setMessage(
            "status" in err && err.status === 422
              ? t("rebaseRefused", { reason: err.body.message })
              : t("rebaseFailed"),
          ),
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
        <Container data-testid={PrActionsTestId.Review}>
          <DropDownButton
            disabled={busy || review.isPending}
            intent="secondary"
            label={t("review")}
            loading={review.isPending}
            menuAriaLabel={t("reviewLevelsAria")}
            menuItems={[
              { id: "thorough", label: t("reviewThorough"), onSelect: () => onReview("thorough") },
              { id: "tested", label: t("reviewTested"), onSelect: () => onReview("tested") },
            ]}
            onClick={() => onReview("quick")}
            size="sm"
          />
        </Container>
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
      {isRebaseable(pr) && (
        <Button
          data-testid={PrActionsTestId.Rebase}
          disabled={rebaseBusy || rebase.isPending}
          intent="secondary"
          loading={rebase.isPending}
          onClick={onRebase}
          size="sm"
        >
          {t("rebase")}
        </Button>
      )}
      {pr.rebase && (
        <TextLink
          data-testid={PrActionsTestId.RebaseStatus}
          href={`/work/tasks/${encodeURIComponent(pr.rebase.taskId)}`}
          linkComponent={NavLink}
        >
          <Tag uppercase tone={pr.rebase.state === "failed" ? "bad" : "neutral"}>
            {t(`rebaseState.${pr.rebase.state}`)} →
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
