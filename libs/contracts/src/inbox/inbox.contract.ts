import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  InboxItemsResponseSchema,
  InboxPrDiffSchema,
  InboxPrsResponseSchema,
  InboxStateSchema,
  RebaseInboxPrInputSchema,
  ReviewInboxPrInputSchema,
  ReviewInboxPrResultSchema,
  SetInboxHiddenSchema,
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
