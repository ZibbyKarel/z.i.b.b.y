import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import { SubtaskSummarySchema } from "../tasks/task-parents.schema";
import {
  CreateDepartmentInputSchema,
  DepartmentRosterSchema,
  DepartmentSchema,
  DepartmentWithStatusSchema,
  DivisionSchema,
  UnownedEntitySchema,
  UpdateDepartmentInputSchema,
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

    // Also before `getDepartment`, for the same reason.
    listDivisions: {
      method: "GET",
      path: "/departments/divisions",
      responses: {
        200: z.array(DivisionSchema),
      },
      summary: "List the divisions departments are grouped under, in org-chart order",
    },

    createDepartment: {
      method: "POST",
      path: "/departments",
      body: CreateDepartmentInputSchema,
      responses: {
        201: DepartmentSchema,
        409: ErrorSchema,
        422: ErrorSchema,
      },
      summary: "Create a department (D-022) — 409 when the id exists, 422 on an unknown division",
    },

    updateDepartment: {
      method: "PATCH",
      path: "/departments/:id",
      pathParams: z.object({ id: z.string() }),
      body: UpdateDepartmentInputSchema,
      responses: {
        200: DepartmentSchema,
        404: ErrorSchema,
        422: ErrorSchema,
      },
      summary: "Update a department's editable fields (id is immutable)",
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

    /**
     * ZB-04a §5 — a filtered view of the `GET /api/tasks/parents` read model's
     * subtask rows: every subtask (a task with `parentTaskId` set) stamped
     * `department === id`. `/departments/:id/subtasks` is a longer path than
     * `/departments/:id`, so there is no key-order shadowing risk (Express
     * matches by segment count first).
     */
    getDepartmentSubtasks: {
      method: "GET",
      path: "/departments/:id/subtasks",
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: z.array(SubtaskSummarySchema),
        404: ErrorSchema,
      },
      summary:
        "This department's subtasks (ZB-03's Subtasks tab — empty unless legacy chain subtasks exist)",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type DepartmentsContract = typeof departmentsContract;
