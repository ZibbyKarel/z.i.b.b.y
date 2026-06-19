import { initContract } from "@ts-rest/core";
import { HealthSchema } from "./health.schema";

const c = initContract();

/**
 * Health/liveness contract. Kept separate from `agentsContract` because it is a
 * cross-cutting operational concern, not part of the agents resource. The NestJS
 * backend implements it via `@ts-rest/nest`; the same object documents itself in
 * the generated OpenAPI spec.
 */
export const healthContract = c.router(
  {
    getHealth: {
      method: "GET",
      path: "/health",
      responses: {
        200: HealthSchema,
      },
      summary: "Liveness probe — reports the API is up",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type HealthContract = typeof healthContract;
