import { initContract } from "@ts-rest/core";
import { MergeQueueQuerySchema, MergeQueueSchema } from "./release.schema";

const c = initContract();

/**
 * Release's merge queue (NS2 F5b) — READ-ONLY. Every open PR across project
 * repos enriched with release signals, for the operator's glance. Merging
 * stays the operator's existing gated `POST /projects/:id/prs/:number/merge`
 * — this contract has no write route, by design (F5b adds zero merge code).
 */
export const releaseContract = c.router(
  {
    getMergeQueue: {
      method: "GET",
      path: "/release/queue",
      query: MergeQueueQuerySchema,
      responses: { 200: MergeQueueSchema },
      summary: "The cross-project merge queue (read-only)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ReleaseContract = typeof releaseContract;
