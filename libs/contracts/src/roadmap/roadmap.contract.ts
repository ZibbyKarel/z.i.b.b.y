import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { DeleteResponseSchema, ErrorSchema } from "../common.schema";
import { ProjectIdSchema } from "../projects/project.schema";
import { LevelMappingSchema } from "./level-mapping.schema";
import {
  CreateRoadmapItemSchema,
  RoadmapConfigSchema,
  RoadmapItemIdSchema,
  RoadmapItemSchema,
  UpdateRoadmapItemSchema,
} from "./roadmap-item.schema";

const c = initContract();

/**
 * The per-project roadmap (Phase 125a): item CRUD + the auto-sync config
 * toggle, plus the global level-mapping table (`/settings?tab=tasks`, not
 * project-scoped — it applies across every project's sync). Only the routes
 * this sub-phase implements land here; `/projects/:projectId/roadmap/sync`
 * (125b) and `/projects/:projectId/roadmap/items/:itemId/play` (125e) are
 * added to this same router by their own sub-phases so each diff stays
 * reviewable (see DECISIONS.md D-005).
 *
 * Route ordering: `/projects/:projectId/roadmap/items` (static) is declared
 * before `/projects/:projectId/roadmap/items/:itemId` (param) for the same
 * reason `agentsContract` orders `/agents/search` before `/agents/:id` — a
 * literal segment must never be shadowed by an adjacent `:param` route.
 * `/roadmap/config` and `/roadmap/level-mapping` sit in their own static
 * segments so neither can collide with `:itemId` either.
 */
export const roadmapContract = c.router(
  {
    listRoadmapItems: {
      method: "GET",
      path: "/projects/:projectId/roadmap",
      pathParams: z.object({ projectId: ProjectIdSchema }),
      responses: {
        200: z.array(RoadmapItemSchema),
      },
      summary: "List a project's roadmap items (epics + tasks)",
    },

    createRoadmapItem: {
      method: "POST",
      path: "/projects/:projectId/roadmap/items",
      pathParams: z.object({ projectId: ProjectIdSchema }),
      body: CreateRoadmapItemSchema,
      responses: {
        201: RoadmapItemSchema,
        409: ErrorSchema,
        422: ErrorSchema,
      },
      summary: "Manually create a roadmap epic or task",
    },

    getRoadmapItem: {
      method: "GET",
      path: "/projects/:projectId/roadmap/items/:itemId",
      pathParams: z.object({ projectId: ProjectIdSchema, itemId: RoadmapItemIdSchema }),
      responses: {
        200: RoadmapItemSchema,
        404: ErrorSchema,
      },
      summary: "Get a single roadmap item",
    },

    updateRoadmapItem: {
      method: "PATCH",
      path: "/projects/:projectId/roadmap/items/:itemId",
      pathParams: z.object({ projectId: ProjectIdSchema, itemId: RoadmapItemIdSchema }),
      body: UpdateRoadmapItemSchema,
      responses: {
        200: RoadmapItemSchema,
        404: ErrorSchema,
      },
      summary: "Edit a roadmap item's operator-owned fields",
    },

    deleteRoadmapItem: {
      method: "DELETE",
      path: "/projects/:projectId/roadmap/items/:itemId",
      pathParams: z.object({ projectId: ProjectIdSchema, itemId: RoadmapItemIdSchema }),
      responses: {
        200: DeleteResponseSchema,
        404: ErrorSchema,
      },
      summary: "Delete a roadmap item",
    },

    getRoadmapConfig: {
      method: "GET",
      path: "/projects/:projectId/roadmap/config",
      pathParams: z.object({ projectId: ProjectIdSchema }),
      responses: {
        200: RoadmapConfigSchema,
      },
      summary: "Get a project's roadmap config (the auto-sync toggle)",
    },

    putRoadmapConfig: {
      method: "PUT",
      path: "/projects/:projectId/roadmap/config",
      pathParams: z.object({ projectId: ProjectIdSchema }),
      body: RoadmapConfigSchema,
      responses: {
        200: RoadmapConfigSchema,
      },
      summary: "Replace a project's roadmap config",
    },

    getLevelMapping: {
      method: "GET",
      path: "/roadmap/level-mapping",
      responses: {
        200: LevelMappingSchema,
      },
      summary: "Get the global external-level -> epic/task/ignore mapping table",
    },

    putLevelMapping: {
      method: "PUT",
      path: "/roadmap/level-mapping",
      body: LevelMappingSchema,
      responses: {
        200: LevelMappingSchema,
      },
      summary: "Replace the global level-mapping table",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type RoadmapContract = typeof roadmapContract;
