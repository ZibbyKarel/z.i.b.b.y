import { z } from "zod";
import { PrReviewEventSchema } from "../approvals/approval.schema";
import type { ActivityKind } from "../activity/activity.schema";
import { IsoDateTimeSchema } from "../common.schema";
import { RoadmapItemSchema, RoadmapSourceKindSchema } from "../roadmap/roadmap-item.schema";
import {
  PrAddressCommentsStateSchema,
  PrFixCiStateSchema,
  PrRebaseStateSchema,
  PrReviewStateSchema,
} from "../tasks/task.schema";

/**
 * Inbox (docs/plans/inbox-ui-spec.md): a view over the synced roadmap cache
 * plus the operator's GitHub PRs. Jira/GitHub stay the source of truth for
 * the task; ZIBBY never edits titles or descriptions from here.
 */

/** A roadmap task in the operator's scope, joined with its project's company/team. */
export const InboxRoadmapItemSchema = RoadmapItemSchema.extend({
  project: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  companyId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  /** True when the operator permanently hid it (`inbox-state.json`). */
  hidden: z.boolean(),
});
export type InboxRoadmapItem = z.infer<typeof InboxRoadmapItemSchema>;

/** The epic an inbox item belongs to; progress counts every child, not just the scoped ones. */
export const InboxEpicSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  key: z.string().min(1).optional(),
  title: z.string().min(1),
  source: RoadmapSourceKindSchema,
  url: z.string().url().optional(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type InboxEpic = z.infer<typeof InboxEpicSchema>;

/** A non-blocking per-integration failure surfaced as a banner above the list. */
export const InboxSourceErrorSchema = z.object({
  projectId: z.string().min(1),
  source: z.enum(["jira", "github"]),
  message: z.string().min(1),
});
export type InboxSourceError = z.infer<typeof InboxSourceErrorSchema>;

export const TodoItemsResponseSchema = z.object({
  items: z.array(InboxRoadmapItemSchema),
});
export type TodoItemsResponse = z.infer<typeof TodoItemsResponseSchema>;

export const InboxItemsResponseSchema = z.object({
  items: z.array(InboxRoadmapItemSchema),
  epics: z.array(InboxEpicSchema),
  /** Projects with a Jira/GitHub integration — what the `Sync` button syncs. Empty = "no integrations" state. */
  syncProjectIds: z.array(z.string().min(1)),
  /** Oldest last-sync across the synced projects (absent before the first sync). */
  syncedAt: IsoDateTimeSchema.optional(),
  errors: z.array(InboxSourceErrorSchema),
});
export type InboxItemsResponse = z.infer<typeof InboxItemsResponseSchema>;

export const InboxPrCiSchema = z.enum(["passing", "failing", "pending", "unknown"]);
export type InboxPrCi = z.infer<typeof InboxPrCiSchema>;
export const InboxPrReviewSchema = z.enum(["approved", "changes-requested", "none"]);
export type InboxPrReview = z.infer<typeof InboxPrReviewSchema>;
/** One prominent blocker per row; the array order IS the sort order. */
export const INBOX_PR_BLOCKERS = [
  "ci-failing",
  "changes-requested",
  "merge-conflict",
  "awaiting-review",
  "ready-to-merge",
] as const;
export const InboxPrBlockerSchema = z.enum(INBOX_PR_BLOCKERS);
export type InboxPrBlocker = z.infer<typeof InboxPrBlockerSchema>;

/**
 * Phase 129 P1 — GitHub-style section of one PR, computed server-side. The array
 * order IS the display order. `needs-your-review` = review requested from you
 * directly; `needs-team-review` = via one of your teams only. Your own PRs:
 * `needs-action` (changes requested, CI failing, merge conflict or draft),
 * `ready-to-merge` (approved + CI passing + not conflicting + not draft),
 * `waiting` (everything else — review or checks pending).
 */
export const INBOX_PR_SECTIONS = [
  "needs-your-review",
  "needs-team-review",
  "waiting",
  "needs-action",
  "ready-to-merge",
] as const;
export const InboxPrSectionSchema = z.enum(INBOX_PR_SECTIONS);
export type InboxPrSection = z.infer<typeof InboxPrSectionSchema>;

export const InboxPrSchema = z.object({
  /** Only GitHub today; the field keeps the list open for another source. */
  source: z.literal("github"),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
  repo: z.string().min(1),
  author: z.string(),
  createdAt: IsoDateTimeSchema,
  /** GitHub's `updated_at` — bumped by any comment, review, push or re-request on the PR. */
  updatedAt: IsoDateTimeSchema.optional(),
  draft: z.boolean(),
  ci: InboxPrCiSchema,
  review: InboxPrReviewSchema,
  /** `null` while GitHub is still computing mergeability. */
  mergeable: z.boolean().nullable(),
  bucket: z.enum(["to-review", "mine"]),
  reviewReason: z.enum(["direct", "team"]).optional(),
  /** `org/team` slug when `reviewReason === "team"`. */
  reviewTeam: z.string().min(1).optional(),
  blocker: InboxPrBlockerSchema,
  section: InboxPrSectionSchema,
  /** Phase 129 P2 — the latest ZIBBY code review of this PR (see `PrReviewStateSchema`). */
  codeReview: z
    .object({
      taskId: z.string().min(1),
      state: PrReviewStateSchema,
      finishedAt: IsoDateTimeSchema.optional(),
      /** todo-16 — the task was started by the PR automation heartbeat, not a click. */
      auto: z.literal(true).optional(),
    })
    .optional(),
  /**
   * todo-16 — the PR head commit from the pull fetch (40-hex). Absent when GitHub did not report
   * a valid one; the PR automation skips such a PR.
   */
  headSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
  /**
   * todo-11 — GitHub's `mergeable_state === "behind"`: the head lacks base commits.
   * Absent otherwise. GitHub reports it only under an "up to date" branch protection.
   */
  behind: z.boolean().optional(),
  /**
   * todo-13 — the PR's head branch, for stacked-PR detection (B is stacked on A when
   * `B.baseRef === A.headRef` in the same repo). Absent for a fork head: its branch lives
   * in another repo and must not match this repo's branches.
   */
  headRef: z.string().min(1).optional(),
  /** todo-13 — the branch this PR merges into. */
  baseRef: z.string().min(1).optional(),
  /**
   * todo-21 — unresolved review threads, read only for the operator's own PRs with
   * "changes requested". Absent when not read or the read failed (unknown).
   */
  unresolvedThreads: z.number().int().nonnegative().optional(),
  /** todo-11 — the latest ZIBBY rebase of this PR (see `PrRebaseStateSchema`). */
  rebase: z.object({ taskId: z.string().min(1), state: PrRebaseStateSchema }).optional(),
  /** PR inbox redesign — the latest ZIBBY "Address review comments" task of this PR. */
  addressComments: z
    .object({
      taskId: z.string().min(1),
      state: PrAddressCommentsStateSchema,
      finishedAt: IsoDateTimeSchema.optional(),
      /** todo-16 — the task was started by the PR automation heartbeat, not a click. */
      auto: z.literal(true).optional(),
    })
    .optional(),
  /** The latest ZIBBY "Fix CI" task of this PR. */
  fixCi: z
    .object({
      taskId: z.string().min(1),
      state: PrFixCiStateSchema,
      finishedAt: IsoDateTimeSchema.optional(),
    })
    .optional(),
  projectId: z.string().min(1),
  companyId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
});
export type InboxPr = z.infer<typeof InboxPrSchema>;

export const InboxPrsResponseSchema = z.object({
  prs: z.array(InboxPrSchema),
  errors: z.array(InboxSourceErrorSchema),
});
export type InboxPrsResponse = z.infer<typeof InboxPrsResponseSchema>;

/**
 * todo-4 — how thorough a PR-inbox code review is. `quick` (the default, also when
 * absent) = the `code-reviewer` agent alone; `thorough` = the `pr-review-thorough`
 * workflow (architecture pass + line-level review); `tested` = `pr-review-tested`
 * (checks out the PR head and runs its tests first). Every level ends in the same
 * Tier-3 `pr-review` approval. `browser` = `pr-review-browser` (`tested` + a
 * ui-ux-tester click-through of the PR head with screenshots saved to the run).
 */
export const PR_REVIEW_LEVELS = ["quick", "thorough", "tested", "browser"] as const;
export const PrReviewLevelSchema = z.enum(PR_REVIEW_LEVELS);
export type PrReviewLevel = z.infer<typeof PrReviewLevelSchema>;

/** Phase 129 P2 — body of `POST /api/inbox/prs/review` ("Do code review"). */
export const ReviewInboxPrInputSchema = z
  .object({
    projectId: z.string().min(1),
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    number: z.number().int().positive(),
    /** Display only (the task title); the PR url is derived server-side from repo + number. */
    title: z.string().max(300).optional(),
    /** Absent = `quick` (old clients keep the agent review). */
    level: PrReviewLevelSchema.optional(),
  })
  .strict();
export type ReviewInboxPrInput = z.infer<typeof ReviewInboxPrInputSchema>;

export const ReviewInboxPrResultSchema = z.object({ taskId: z.string().min(1) });
export type ReviewInboxPrResult = z.infer<typeof ReviewInboxPrResultSchema>;

/**
 * todo-11 — body of `POST /api/inbox/prs/rebase`. Branch names and the head sha are
 * read from GitHub server-side, never taken from the client. Response = `ReviewInboxPrResult`.
 */
export const RebaseInboxPrInputSchema = z
  .object({
    projectId: z.string().min(1),
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    number: z.number().int().positive(),
    /** Display only (the task title). */
    title: z.string().max(300).optional(),
  })
  .strict();
export type RebaseInboxPrInput = z.infer<typeof RebaseInboxPrInputSchema>;

/**
 * Body of `POST /api/inbox/prs/address-comments` — same shape as a rebase; refs are read from GitHub
 * server-side. Strict, so a client can never send `auto` (400): todo-16's auto flag is a separate
 * server-side argument of `InboxAddressCommentsService.start`, never part of the HTTP body.
 */
export const AddressInboxPrCommentsInputSchema = RebaseInboxPrInputSchema;
export type AddressInboxPrCommentsInput = RebaseInboxPrInput;

/** Body of `POST /api/inbox/prs/fix-ci` — same shape as a rebase. */
export const FixInboxPrCiInputSchema = RebaseInboxPrInputSchema;
export type FixInboxPrCiInput = RebaseInboxPrInput;

/** One PR's unified diff; `truncated` = GitHub refused it (too large) or it was capped. */
export const InboxPrDiffSchema = z.object({ diff: z.string(), truncated: z.boolean() });
export type InboxPrDiff = z.infer<typeof InboxPrDiffSchema>;

export const InboxPrThreadCommentSchema = z.object({
  id: z.string(),
  author: z.object({ login: z.string(), avatarUrl: z.string() }).nullable(),
  createdAt: IsoDateTimeSchema,
  body: z.string(),
});
export type InboxPrThreadComment = z.infer<typeof InboxPrThreadCommentSchema>;

/** One GitHub review thread (GraphQL node id `PRRT_…`). */
export const InboxPrThreadSchema = z.object({
  id: z.string().regex(/^PRRT_[\w-]+$/),
  isResolved: z.boolean(),
  isOutdated: z.boolean(),
  path: z.string(),
  line: z.number().int().nullable(),
  startLine: z.number().int().nullable(),
  diffHunk: z.string(),
  comments: z.array(InboxPrThreadCommentSchema),
});
export type InboxPrThread = z.infer<typeof InboxPrThreadSchema>;
export const InboxPrThreadsSchema = z.array(InboxPrThreadSchema);

/** Reply to a thread and/or resolve it; at least one is required. */
export const ReplyInboxPrThreadInputSchema = z
  .object({
    body: z.string().trim().min(1).max(65536).optional(),
    resolve: z.boolean().optional(),
  })
  .refine((v) => v.body !== undefined || v.resolve === true, {
    message: "Provide a body or resolve: true",
  });
export type ReplyInboxPrThreadInput = z.infer<typeof ReplyInboxPrThreadInputSchema>;

/** The operator's own PR review; only APPROVE may omit the body. */
export const SubmitInboxPrReviewInputSchema = z
  .object({
    event: PrReviewEventSchema,
    body: z.string().trim().max(65536).optional(),
  })
  .refine((v) => v.event === "APPROVE" || Boolean(v.body), {
    message: "Request changes and comment need a body",
    path: ["body"],
  });
export type SubmitInboxPrReviewInput = z.infer<typeof SubmitInboxPrReviewInputSchema>;
/** GitHub's review id. */
export const SubmitInboxPrReviewResultSchema = z.object({ id: z.number().int() });
export type SubmitInboxPrReviewResult = z.infer<typeof SubmitInboxPrReviewResultSchema>;

/** Hide key: the item's source identity, stable across re-syncs. */
export const InboxHiddenKeySchema = z.object({
  integrationId: z.string().min(1),
  externalId: z.string().min(1),
});
export type InboxHiddenKey = z.infer<typeof InboxHiddenKeySchema>;

/** `.zibby/data/inbox-state.json` — operator-personal, gitignored. */
export const InboxStateSchema = z.object({
  hidden: z.array(InboxHiddenKeySchema).default([]),
});
export type InboxState = z.infer<typeof InboxStateSchema>;

export const SetInboxHiddenSchema = InboxHiddenKeySchema.extend({ hidden: z.boolean() }).strict();
export type SetInboxHidden = z.infer<typeof SetInboxHiddenSchema>;

/**
 * Activity kinds after which the inbox PR/issue lists are stale: a task may have
 * opened a PR or drafted a review (the posted review itself drops the API cache
 * directly, in InboxReviewService), a merge closed one, a roadmap sync/dispatch/outcome
 * changed the issues. The web invalidates both inbox queries on these, the API drops
 * its PR cache — everything else waits for the 15-min poll.
 */
export const INBOX_REFRESH_ACTIVITY_KINDS: readonly ActivityKind[] = [
  "task-outcome",
  "merge-completed",
  "post-merge-outcome",
  "roadmap-sync",
  "roadmap-item-dispatched",
  "roadmap-item-outcome",
  // todo-16 — an auto-started review / address-comments task changes the PR's chip.
  "pr-automation-started",
];
