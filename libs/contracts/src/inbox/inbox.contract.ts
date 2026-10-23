import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  AddressInboxPrCommentsInputSchema,
  FixInboxPrCiInputSchema,
  InboxItemsResponseSchema,
  InboxPrDiffSchema,
  InboxPrThreadSchema,
  InboxPrThreadsSchema,
  InboxPrsResponseSchema,
  InboxStateSchema,
  RebaseInboxPrInputSchema,
  ReplyInboxPrThreadInputSchema,
  ReviewInboxPrInputSchema,
  ReviewInboxPrResultSchema,
  SetInboxHiddenSchema,
  SubmitInboxPrReviewInputSchema,
  SubmitInboxPrReviewResultSchema,
  TodoItemsResponseSchema,
} from "./inbox.schema";

const c = initContract();

/**
 * Inbox (docs/plans/inbox-ui-spec.md). `listInboxItems` is the cross-project
 * roadmap list, already narrowed to the operator's scope on the server (from
 * the sync's `scopeReasons`); filtering and search run on the client.
 * `/roadmap/items` has no `:projectId` segment, so it cannot collide with the
 * per-project `/projects/:projectId/roadmap/...` routes.
 */
export const inboxContract = c.router(
  {
    listInboxItems: {
      method: "GET",
      path: "/roadmap/items",
      responses: { 200: InboxItemsResponseSchema },
      summary: "List roadmap tasks in the operator's scope across all projects",
    },
    listTodoItems: {
      method: "GET",
      path: "/roadmap/todo",
      responses: { 200: TodoItemsResponseSchema },
      summary: "List open manual roadmap tasks across all projects, newest first (TODO widget)",
    },
    listInboxPrs: {
      method: "GET",
      path: "/inbox/prs",
      responses: { 200: InboxPrsResponseSchema },
      summary: "List GitHub PRs awaiting the operator's review and the operator's own open PRs",
    },
    reviewInboxPr: {
      method: "POST",
      path: "/inbox/prs/review",
      body: ReviewInboxPrInputSchema,
      responses: {
        201: ReviewInboxPrResultSchema,
        404: ErrorSchema,
        // 422: the project has no GitHub link, or `repo` is not the project's repo.
        422: ErrorSchema,
      },
      summary:
        "Start a code review task for one PR (level quick = code-reviewer agent, thorough/tested = pr-review-* workflow); the finished review is parked as a Tier-3 approval to post it as a COMMENT",
    },
    rebaseInboxPr: {
      method: "POST",
      path: "/inbox/prs/rebase",
      body: RebaseInboxPrInputSchema,
      responses: {
        201: ReviewInboxPrResultSchema,
        404: ErrorSchema,
        // 422: no GitHub link, foreign repo, fork head, closed PR, or a head that is the
        // base/default branch.
        422: ErrorSchema,
      },
      summary:
        "Start a rebase of one PR's head onto its base (pr-rebase workflow); ZIBBY force-pushes with lease — right away when conflict-free, after a Tier-3 approval when conflicts were resolved",
    },
    addressInboxPrComments: {
      method: "POST",
      path: "/inbox/prs/address-comments",
      body: AddressInboxPrCommentsInputSchema,
      responses: {
        201: ReviewInboxPrResultSchema,
        404: ErrorSchema,
        // 422: no GitHub link, foreign repo, fork head, closed PR, a base/default-branch head,
        // or a run already in flight.
        422: ErrorSchema,
      },
      summary:
        "Start an agent that fixes one PR's unresolved review comments (pr-address-comments workflow); ZIBBY fast-forwards the PR head — right away when every comment was addressed with green checks, after a Tier-3 approval otherwise",
    },
    fixInboxPrCi: {
      method: "POST",
      path: "/inbox/prs/fix-ci",
      body: FixInboxPrCiInputSchema,
      responses: {
        201: ReviewInboxPrResultSchema,
        404: ErrorSchema,
        // 422: no GitHub link, foreign repo, fork head, closed PR, a base/default-branch head,
        // or a run already in flight.
        422: ErrorSchema,
      },
      summary:
        "Start an agent that fixes one PR's failing CI checks (pr-fix-ci workflow); ZIBBY fast-forwards the PR head — right away on the operator's own PR after a full fix, after a Tier-3 approval otherwise",
    },
    getInboxPrDiff: {
      method: "GET",
      path: "/inbox/prs/:projectId/:number/diff",
      pathParams: z.object({
        projectId: z.string().min(1),
        number: z.coerce.number().int().positive(),
      }),
      responses: {
        200: InboxPrDiffSchema,
        404: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary:
        "Get one PR's unified diff from GitHub (repo derived from the project's GitHub link)",
    },
    getInboxPrThreads: {
      method: "GET",
      path: "/inbox/prs/:projectId/:number/threads",
      pathParams: z.object({
        projectId: z.string().min(1),
        number: z.coerce.number().int().positive(),
      }),
      responses: {
        200: InboxPrThreadsSchema,
        404: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "List one PR's review threads from GitHub",
    },
    replyInboxPrThread: {
      method: "POST",
      path: "/inbox/prs/:projectId/:number/threads/:threadId/reply",
      pathParams: z.object({
        projectId: z.string().min(1),
        number: z.coerce.number().int().positive(),
        threadId: z.string().regex(/^PRRT_[\w-]+$/),
      }),
      body: ReplyInboxPrThreadInputSchema,
      responses: { 200: InboxPrThreadSchema, 404: ErrorSchema, 422: ErrorSchema, 502: ErrorSchema },
      summary: "Reply to and/or resolve one PR review thread; returns the updated thread",
    },
    submitInboxPrReview: {
      method: "POST",
      path: "/inbox/prs/:projectId/:number/reviews",
      pathParams: z.object({
        projectId: z.string().min(1),
        number: z.coerce.number().int().positive(),
      }),
      body: SubmitInboxPrReviewInputSchema,
      responses: {
        201: SubmitInboxPrReviewResultSchema,
        404: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "Post the operator's own review (approve / request changes / comment) on one PR",
    },
    getInboxState: {
      method: "GET",
      path: "/inbox/state",
      responses: { 200: InboxStateSchema },
      summary: "Get the operator's hidden inbox items",
    },
    setInboxHidden: {
      method: "PUT",
      path: "/inbox/state",
      body: SetInboxHiddenSchema,
      responses: { 200: InboxStateSchema },
      summary: "Hide or unhide one inbox item",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type InboxContract = typeof inboxContract;
