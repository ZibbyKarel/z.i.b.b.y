import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { ActivityEntrySchema, ActivityQuerySchema } from "./activity.schema";

const c = initContract();

/**
 * Activity (Phase 6.1): READ-ONLY access to the append-only activity log. There is
 * deliberately NO write endpoint — entries are born only inside the API process
 * (the emission points beside the existing diagnostics logs), so a client can never
 * forge the record. The overview feed and the briefing read through this route.
 */
export const activityContract = c.router(
  {
    listActivity: {
      method: "GET",
      path: "/activity",
      query: ActivityQuerySchema,
      responses: { 200: z.array(ActivityEntrySchema), 422: ErrorSchema },
      summary: "List recorded activity (newest-first, defaulting to today)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ActivityContract = typeof activityContract;
