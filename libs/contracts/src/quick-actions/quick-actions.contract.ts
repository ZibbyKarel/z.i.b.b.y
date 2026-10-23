import { initContract } from "@ts-rest/core";
import { QuickActionsSchema } from "./quick-action.schema";

const c = initContract();

/**
 * Quick actions — operator-owned one-click task definitions for the Bridge
 * "Quick actions" widget. One small file-backed list (same shape as `pins`):
 * `getQuickActions` reads it (empty when the file is missing), `putQuickActions`
 * replaces the whole list.
 */
export const quickActionsContract = c.router(
  {
    getQuickActions: {
      method: "GET",
      path: "/quick-actions",
      responses: { 200: QuickActionsSchema },
      summary: "Get the quick actions",
    },
    putQuickActions: {
      method: "PUT",
      path: "/quick-actions",
      body: QuickActionsSchema,
      responses: { 200: QuickActionsSchema },
      summary: "Replace the quick actions",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type QuickActionsContract = typeof quickActionsContract;
