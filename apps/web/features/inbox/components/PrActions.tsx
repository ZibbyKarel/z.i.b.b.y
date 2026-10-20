"use client";

import { useQueryClient } from "@tanstack/react-query";
import type {
  InboxPr,
  PrAddressCommentsState,
  PrRebaseState,
  PrReviewLevel,
  PrReviewState,
} from "@zibby/contracts";
import {
  Button,
  Checkbox,
  Container,
  DropDownButton,
  HoldButton,
  Row,
  StatusDot,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useMergeProjectPrMutation } from "../../projects/mutations";
import {
  useAddressInboxPrCommentsMutation,
  useRebaseInboxPrMutation,
  useReviewInboxPrMutation,
} from "../mutations";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";
import { useSessionFlags } from "../useSessionFlags";
import { NavLink } from "./links";

export enum PrActionsTestId {
  Review = "inbox-pr-review",
  Address = "inbox-pr-address-comments",
  Rebase = "inbox-pr-rebase",
  Running = "inbox-pr-running",
  Failed = "inbox-pr-failed",
  Merge = "inbox-pr-merge",
  DeleteBranch = "inbox-pr-delete-branch",
  Message = "inbox-pr-action-message",
}

/** The review modes the menu offers (`thorough` stays in the API for old clients only). */
export type PrReviewMode = Exclude<PrReviewLevel, "thorough">;
export const REVIEW_MODES: readonly PrReviewMode[] = ["quick", "tested", "browser"];
export const REVIEW_MODE_STORAGE_KEY = "zibby-inbox-pr-review-mode";

type Run =
  | { kind: "review"; taskId: string; state: PrReviewState }
  | { kind: "rebase"; taskId: string; state: PrRebaseState }
  | { kind: "address"; taskId: string; state: PrAddressCommentsState };

const isReview = (pr: InboxPr) => pr.bucket === "to-review" && !pr.draft;
const isFix = (pr: InboxPr) =>
  !isReview(pr) &&
  pr.bucket === "mine" &&
  pr.blocker === "changes-requested" &&
  pr.headRef !== undefined &&
  pr.unresolvedThreads !== 0; // todo-21: nothing left to address (undefined = unknown → offer)
/** todo-11 — offered only when conflicting or behind, never as a fallback. */
const isRebase = (pr: InboxPr) =>
  !isReview(pr) &&
  !isFix(pr) &&
  pr.bucket === "mine" &&
  (pr.mergeable === false || pr.behind === true);
const isMerge = (pr: InboxPr) => pr.section === "ready-to-merge";

/** The PR's ZIBBY runs, address → rebase → review (the order the label prefers). */
function runsOf(pr: InboxPr): Run[] {
  const runs: Run[] = [];
  if (pr.addressComments) runs.push({ kind: "address", ...pr.addressComments });
  if (pr.rebase) runs.push({ kind: "rebase", ...pr.rebase });
  if (pr.codeReview) runs.push({ kind: "review", ...pr.codeReview });
  return runs;
}
const inFlight = (r: Run) => r.state === "running" || r.state === "awaiting-approval";

/** Whether `PrActions` renders anything for this PR. */
export const hasPrActions = (pr: InboxPr) =>
  isReview(pr) ||
  isFix(pr) ||
  isRebase(pr) ||
  isMerge(pr) ||
  runsOf(pr).some((r) => inFlight(r) || r.state === "failed");

const taskHref = (id: string) => `/work/tasks/${encodeURIComponent(id)}`;

export interface PrActionsProps {
  pr: InboxPr;
  /** What the PR sits on (`prBaseLabel`): `#12` or a branch — "Rebase on …". */
  baseLabel: string;
}

/**
 * A PR card's action row, each an explicit operator click:
 * - a review request → split "Review · <mode>": the primary click runs the selected mode
 *   (quick / thorough = `tested` / thorough + browser), the menu only picks the mode
 *   (remembered per PR url for the session). Posting to GitHub waits on a Tier-3 approval;
 * - my PR with changes requested → "Address review comments": a `pr-address-comments` task.
 *   ZIBBY fast-forwards the fixes (never force) — right away for `Addressed: all` (Tier-2),
 *   after a Tier-3 approval otherwise;
 * - my PR conflicting with / behind its base → "Rebase on <base>" (todo-11). Never a fallback;
 * - `ready-to-merge` → hold-to-confirm "Squash and merge" (optionally deleting the head branch).
 * While a ZIBBY run is in flight its running label (linked to the task) replaces the buttons;
 * a failed run keeps the buttons and adds a link to the failed task.
 */
export function PrActions({ pr, baseLabel }: PrActionsProps) {
  const t = useTranslations("inboxPage.prs.actions");
  const qc = useQueryClient();
  const review = useReviewInboxPrMutation();
  const merge = useMergeProjectPrMutation();
  const rebase = useRebaseInboxPrMutation();
  const address = useAddressInboxPrCommentsMutation();
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [modes, setMode] = useSessionFlags<string>(REVIEW_MODE_STORAGE_KEY);
  const mode = REVIEW_MODES.find((m) => m === modes[pr.url]) ?? "quick";

  if (!hasPrActions(pr)) return null;

  const runLabel = (r: Run) => {
    switch (r.kind) {
      case "review":
        return t(`reviewState.${r.state}`);
      case "rebase":
        return t(`rebaseState.${r.state}`);
      case "address":
        return t(`addressState.${r.state}`);
    }
  };

  const target = { projectId: pr.projectId, repo: pr.repo, number: pr.number, title: pr.title };

  const onReview = (level: PrReviewMode) =>
    review.mutate(
      { body: { ...target, level } },
      {
        // The running label already reports the started review once the list refetches.
        onSuccess: () => setMessage(null),
        onError: () => setMessage(t("reviewFailed")),
      },
    );

  const onRebase = () =>
    rebase.mutate(
      { body: target },
      {
        onSuccess: () => setMessage(null),
        onError: (err) =>
          setMessage(
            "status" in err && err.status === 422
              ? t("rebaseRefused", { reason: err.body.message })
              : t("rebaseFailed"),
          ),
      },
    );

  const onAddress = () =>
    address.mutate(
      { body: target },
      {
        onSuccess: () => setMessage(null),
        onError: (err) =>
          setMessage(
            "status" in err && err.status === 422
              ? t("addressRefused", { reason: err.body.message })
              : t("addressFailed"),
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

  const running = runsOf(pr).find(inFlight);
  const failed = runsOf(pr).find((r) => r.state === "failed");

  return (
    <Row wrap gap="150">
      {running ? (
        <TextLink
          data-testid={PrActionsTestId.Running}
          href={taskHref(running.taskId)}
          linkComponent={NavLink}
        >
          <Row gap="75">
            <StatusDot pulse size="75" tone="working" />
            <Typography mono uppercase type="label" variant="secondary">
              {runLabel(running)}
            </Typography>
          </Row>
        </TextLink>
      ) : (
        <>
          {isReview(pr) && (
            <Container data-testid={PrActionsTestId.Review}>
              <DropDownButton
                disabled={review.isPending}
                intent="primary"
                label={t("reviewMode", { mode: t(`mode.${mode}.label`) })}
                loading={review.isPending}
                menuAriaLabel={t("reviewLevelsAria")}
                menuItems={REVIEW_MODES.map((m) => ({
                  id: m,
                  label: t(`mode.${m}.label`),
                  description: t(`mode.${m}.desc`),
                  checked: m === mode,
                  onSelect: () => setMode(pr.url, m),
                }))}
                onClick={() => onReview(mode)}
                size="sm"
              />
            </Container>
          )}
          {isFix(pr) && (
            <Button
              data-testid={PrActionsTestId.Address}
              disabled={address.isPending}
              intent="primary"
              loading={address.isPending}
              onClick={onAddress}
              size="sm"
            >
              {t("address")}
            </Button>
          )}
          {isRebase(pr) && (
            <Button
              data-testid={PrActionsTestId.Rebase}
              disabled={rebase.isPending}
              intent="secondary"
              loading={rebase.isPending}
              onClick={onRebase}
              size="sm"
            >
              {t("rebaseOn", { base: baseLabel.toUpperCase() })}
            </Button>
          )}
          {isMerge(pr) && (
            <>
              <HoldButton
                armedLabel={t("mergeArmed")}
                data-testid={PrActionsTestId.Merge}
                doneLabel={t("mergeDone")}
                label={t("merge")}
                onConfirm={onMerge}
                size="sm"
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
          {failed && (
            <TextLink
              data-testid={PrActionsTestId.Failed}
              href={taskHref(failed.taskId)}
              linkComponent={NavLink}
            >
              <Tag uppercase tone="bad">
                {runLabel(failed)} →
              </Tag>
            </TextLink>
          )}
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
