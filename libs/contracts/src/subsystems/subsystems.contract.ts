import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import { SubsystemWithStatusSchema } from "./subsystem.schema";

const c = initContract();

/**
 * The subsystem-federation registry (design doc
 * `docs/superpowers/specs/2026-07-08-subsystem-federation-design.md`): the eight
 * named subsystems plus their live status. Phase 80 is identity + a stub status
 * (`state: "idle"`, zero counts); phase 82 fills in real aggregation.
 */
export const subsystemsContract = c.router(
  {
    getSubsystems: {
      method: "GET",
      path: "/subsystems",
      responses: {
        200: z.array(SubsystemWithStatusSchema),
      },
      summary: "List all eight federation subsystems with their current status",
    },

    getSubsystem: {
      method: "GET",
      path: "/subsystems/:id",
      // Plain string, not `SubsystemIdSchema` — an id outside the 8-value enum
      // must reach the handler and come back as the contract's declared 404
      // `ErrorSchema`. An enum-typed pathParams schema would fail ts-rest's own
      // validation first and throw a 400 `BadRequestException` instead, before
      // the handler (and its 404 mapping) ever runs.
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: SubsystemWithStatusSchema,
        404: ErrorSchema,
      },
      summary: "Get a single subsystem by id",
    },

    markSubsystemSeen: {
      method: "POST",
      path: "/subsystems/:id/seen",
      // Same plain-string pathParams pattern as `getSubsystem` — see its comment.
      pathParams: z.object({ id: z.string() }),
      body: EmptyBodySchema,
      responses: {
        200: SubsystemWithStatusSchema,
        404: ErrorSchema,
      },
      summary:
        "Acknowledge a subsystem's Tier-2 reports (opening its drawer) — resets its report window and returns the refreshed entry",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type SubsystemsContract = typeof subsystemsContract;
