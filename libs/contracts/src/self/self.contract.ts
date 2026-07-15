import { initContract } from "@ts-rest/core";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import { SelfStatusSchema, SelfUpdateResultSchema } from "./self.schema";

const c = initContract();

/**
 * Phase 79 — the ZIBBY install repo's own freshness, a cross-cutting operational
 * concern (like `health`/`limits`), kept out of `projects` because this is about
 * the ZIBBY checkout itself, not a delivered project. `getSelfStatus` is polled
 * STATE (like `health`/`limits`), not streamed. `updateSelf` is the one
 * sanctioned self-update: `git pull --ff-only`, refuses a dirty tree or a
 * non-fast-forward history with a 409 — operator-triggered only, never
 * autonomous, never `--force`/`reset`.
 */
export const selfContract = c.router(
  {
    getSelfStatus: {
      method: "GET",
      path: "/self/status",
      responses: {
        200: SelfStatusSchema,
      },
      summary: "The ZIBBY install repo's freshness vs. origin, plus its open PRs",
    },
    updateSelf: {
      method: "POST",
      path: "/self/update",
      body: EmptyBodySchema,
      responses: {
        200: SelfUpdateResultSchema,
        409: ErrorSchema,
      },
      summary: "Fast-forward-only pull of the ZIBBY install repo (refuses dirty/non-ff)",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type SelfContract = typeof selfContract;
