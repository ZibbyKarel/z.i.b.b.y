import { initContract } from "@ts-rest/core";
import {
  InboxItemsResponseSchema,
  InboxPrsResponseSchema,
  InboxStateSchema,
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
