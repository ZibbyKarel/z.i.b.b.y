import { initContract } from "@ts-rest/core";
import { LimitsSchema } from "./limits.schema";

const c = initContract();

/**
 * Limits contract. A cross-cutting operational concern (like `health`), kept out
 * of the agents resource: it reports the current Claude interactive-window
 * utilization (rolling 5h + weekly) so the dashboard can render — and poll — the
 * limits panel. The NestJS backend implements it via `@ts-rest/nest`; the same
 * object both documents itself in the OpenAPI spec and types the frontend `tsr`
 * hook.
 */
export const limitsContract = c.router(
  {
    getLimits: {
      method: "GET",
      path: "/limits",
      responses: {
        200: LimitsSchema,
      },
      summary: "Current Claude interactive-window utilization (rolling 5h + weekly)",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type LimitsContract = typeof limitsContract;
