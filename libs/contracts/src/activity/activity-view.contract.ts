import { initContract } from "@ts-rest/core";
import { ErrorSchema } from "../common.schema";
import { ActivityViewSchema } from "./activity-view.schema";

const c = initContract();

/**
 * The RightRail live-log display config: a single operator-owned document, the
 * {@link mandateContract} twin. GET returns the current view (seeded default if
 * absent); PUT replaces it, strict-validated — a 422 on any unknown group key, so
 * an inbound payload can never widen what the rail shows (Law 4). There is exactly
 * one view; no id, no list.
 */
export const activityViewContract = c.router(
  {
    getActivityView: {
      method: "GET",
      path: "/activity/view",
      responses: { 200: ActivityViewSchema },
      summary: "Get the RightRail activity-log display config",
    },
    setActivityView: {
      method: "PUT",
      path: "/activity/view",
      body: ActivityViewSchema,
      responses: { 200: ActivityViewSchema, 422: ErrorSchema },
      summary: "Replace the activity-log display config (strict — rejects unknown keys)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ActivityViewContract = typeof activityViewContract;
