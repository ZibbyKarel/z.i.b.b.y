import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import {
  DepartmentRosterSchema,
  DepartmentWithStatusSchema,
  UnownedEntitySchema,
} from "./department.schema";

const c = initContract();

/**
 * The department-federation registry (design doc
 * `docs/superpowers/specs/2026-07-08-department-federation-design.md`): the eight
 * named departments plus their live status. Phase 80 is identity + a stub status
 * (`state: "idle"`, zero counts); phase 82 fills in real aggregation.
 */
export const departmentsContract = c.router(
  {
    getDepartments: {
      method: "GET",
      path: "/departments",
      responses: {
        200: z.array(DepartmentWithStatusSchema),
      },
      summary: "List all eight federation departments with their current status",
    },

    // Declared before `getDepartment` so `/departments/unowned` is matched as its
    // own route rather than captured by the `/departments/:id` param (mirrors
    // `searchAgents` vs `getAgent` in `agents.contract.ts`).
    listUnownedEntities: {
      method: "GET",
      path: "/departments/unowned",
      responses: {
        200: z.array(UnownedEntitySchema),
      },
      summary:
        "List stored entities (pipelines/chains/agents/integrations) with no department (F1b) — [] once the owner-backfill sweep has run",
    },

    getDepartment: {
      method: "GET",
      path: "/departments/:id",
      // Plain string, not `DepartmentIdSchema` — an id outside the 8-value enum
      // must reach the handler and come back as the contract's declared 404
      // `ErrorSchema`. An enum-typed pathParams schema would fail ts-rest's own
      // validation first and throw a 400 `BadRequestException` instead, before
      // the handler (and its 404 mapping) ever runs.
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: DepartmentWithStatusSchema,
        404: ErrorSchema,
      },
      summary: "Get a single department by id",
    },

    markDepartmentSeen: {
      method: "POST",
      path: "/departments/:id/seen",
      // Same plain-string pathParams pattern as `getDepartment` — see its comment.
      pathParams: z.object({ id: z.string() }),
      body: EmptyBodySchema,
      responses: {
        200: DepartmentWithStatusSchema,
        404: ErrorSchema,
      },
      summary:
        "Acknowledge a department's Tier-2 reports (opening its drawer) — resets its report window and returns the refreshed entry",
    },

    getRoster: {
      method: "GET",
      path: "/departments/:id/roster",
      // Same plain-string pathParams pattern as `getDepartment` — see its comment.
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: DepartmentRosterSchema,
        404: ErrorSchema,
      },
      summary:
        "NS2 F1c: a department's stored roster — owned agents, integrations, and CI monitors",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type DepartmentsContract = typeof departmentsContract;
