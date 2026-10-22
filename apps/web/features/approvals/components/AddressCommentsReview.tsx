"use client";

import type {
  InboxPrThread,
  OperatorThreadReply,
  PrReviewEvent,
  PrThreadOutcome,
  ScheduledTask,
} from "@zibby/contracts";
import {
  Accordion,
  AccordionItem,
  Container,
  Markdown,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { ReviewThread } from "../../inbox/components/ReviewThread/ReviewThread";
import { useInboxPrThreadsQuery } from "../../inbox/queries";

export enum AddressCommentsReviewTestId {
  Root = "address-comments-review-root",
  Summary = "address-comments-review-summary",
  Report = "address-comments-review-report",
  AlreadyResolved = "address-comments-review-already-resolved",
  FallbackDraft = "address-comments-review-fallback-draft",
}

type AddressComments = NonNullable<ScheduledTask["prAddressComments"]>;

export interface MergedReviewThread {
  thread: InboxPrThread;
  outcome?: PrThreadOutcome;
  isNew: boolean;
  /** `null` = already resolved on GitHub, nothing to send. */
  draft: { body: string; resolve: boolean } | null;
}

/**
 * Report order first (threads the address run saw), then open threads missing from the
 * report (`isNew`). A report thread resolved on GitHub gets `draft: null`.
 */
export function mergeReviewThreads(
  threads: InboxPrThread[],
  outcomes: PrThreadOutcome[],
  drafts: { threadId: string; body: string; resolve?: boolean }[],
): MergedReviewThread[] {
  const byId = new Map(threads.map((t) => [t.id, t]));
  const draftOf = (thread: InboxPrThread) => {
    if (thread.isResolved) return null;
    const d = drafts.find((x) => x.threadId === thread.id);
    return { body: d?.body ?? "", resolve: d?.resolve ?? false };
  };
  const seen = new Set<string>();
  const rows: MergedReviewThread[] = [];
  for (const outcome of outcomes) {
    const thread = byId.get(outcome.threadId);
    if (!thread || seen.has(thread.id)) continue;
    seen.add(thread.id);
    rows.push({ thread, outcome, isNew: false, draft: draftOf(thread) });
  }
  for (const thread of threads) {
    if (seen.has(thread.id) || thread.isResolved) continue;
    rows.push({ thread, isNew: true, draft: draftOf(thread) });
  }
  return rows;
}

/** The operator-shape replies for every shown open thread (resolved-on-GitHub rows excluded). */
export function repliesOf(rows: MergedReviewThread[]): OperatorThreadReply[] {
  return rows.flatMap((r) =>
    r.draft ? [{ threadId: r.thread.id, body: r.draft.body, resolve: r.draft.resolve }] : [],
  );
}

/** Reply drafts straight from the task — used while the live threads are unavailable. */
export function draftRepliesOf(addr: AddressComments): OperatorThreadReply[] {
  return (addr.replies ?? []).map((r) => ({
    threadId: r.threadId,
    body: r.body,
    resolve: r.resolve ?? false,
  }));
}

/**
 * What approve sends for a pr-address-comments task: the live threads joined with the report
 * drafts (or the task's own drafts while the threads are unavailable), overlaid with the
 * operator's per-thread edits.
 */
export function addressApproveReplies(
  address: AddressComments,
  threads: InboxPrThread[] | undefined,
  edits: Record<string, OperatorThreadReply>,
): OperatorThreadReply[] {
  const drafts = draftRepliesOf(address);
  // Without live threads the operator sees nothing to tick, so no resolve may go out unseen.
  const base = threads
    ? repliesOf(mergeReviewThreads(threads, address.outcomes ?? [], drafts))
    : drafts.map((r) => ({ ...r, resolve: false }));
  return base.map((r) => edits[r.threadId] ?? r);
}

/** The approve request body: `replies` for an address-comments approval, else the review event. */
export function approveRequestBody(
  replies: OperatorThreadReply[] | undefined,
  reviewEvent: PrReviewEvent | undefined,
) {
  return replies ? { replies } : reviewEvent ? { reviewEvent } : {};
}

export interface AddressCommentsReviewProps {
  task: ScheduledTask;
  now: number;
  /** Current (possibly edited) reply for every shown open thread. */
  replies: OperatorThreadReply[];
  onRepliesChange(next: OperatorThreadReply[]): void;
}

/** The `pr-address-comments` approval body: summary, editable thread list, collapsed report. */
export function AddressCommentsReview({
  task,
  now,
  replies,
  onRepliesChange,
}: AddressCommentsReviewProps) {
  const t = useTranslations("approvals");
  const addr = task.prAddressComments;
  const threadsQuery = useInboxPrThreadsQuery(task.projectId, addr?.number);
  if (!addr) return null;

  const outcomes = addr.outcomes ?? [];
  const rows = threadsQuery.data
    ? mergeReviewThreads(threadsQuery.data, outcomes, replies)
    : undefined;
  const count = (kind: PrThreadOutcome["kind"]) => outcomes.filter((o) => o.kind === kind).length;
  const open = rows?.filter((r) => r.draft) ?? [];
  const resolved = rows?.filter((r) => !r.draft) ?? [];

  const change = (threadId: string, next: { body: string; resolve: boolean }) =>
    onRepliesChange(replies.map((r) => (r.threadId === threadId ? { ...r, ...next } : r)));

  return (
    <Stack data-testid={AddressCommentsReviewTestId.Root} gap="200">
      <Typography data-testid={AddressCommentsReviewTestId.Summary} type="h3">
        {t("addressSummary", {
          done: count("done"),
          total: outcomes.length,
          question: count("question"),
          skipped: count("skipped"),
        })}
      </Typography>
      {!rows && threadsQuery.isError && (
        <Typography size="sm" tone="bad" type="text">
          {t("addressThreadsError")}
        </Typography>
      )}
      {!rows &&
        replies
          .filter((r) => r.body.trim())
          .map((r) => (
            <Stack
              data-testid={AddressCommentsReviewTestId.FallbackDraft}
              gap="50"
              key={r.threadId}
            >
              <Typography mono type="note" variant="secondary">
                {r.threadId}
              </Typography>
              <Markdown escapeHtml source={r.body} />
            </Stack>
          ))}
      {open.map(({ thread, outcome, isNew, draft }) => (
        <ReviewThread
          isNew={isNew}
          key={thread.id}
          now={now}
          outcome={outcome}
          reply={{
            body: draft?.body ?? "",
            resolve: draft?.resolve ?? false,
            onChange: (next) => change(thread.id, next),
          }}
          thread={thread}
        />
      ))}
      {resolved.length > 0 && (
        <Stack data-testid={AddressCommentsReviewTestId.AlreadyResolved} gap="150">
          <Typography tracking="wider" type="labelSm" variant="tertiary">
            {t("addressAlreadyResolved")}
          </Typography>
          {resolved.map(({ thread, outcome }) => (
            <ReviewThread key={thread.id} now={now} outcome={outcome} thread={thread} />
          ))}
        </Stack>
      )}
      {addr.report && (
        <div data-testid={AddressCommentsReviewTestId.Report}>
          <Accordion>
            <AccordionItem summary={t("addressReport")}>
              <Container maxHeight="50vh" overflow="auto">
                <Markdown escapeHtml source={addr.report} />
              </Container>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </Stack>
  );
}
