import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { DeleteResponseSchema, EmptyBodySchema, ErrorSchema } from "../common.schema";
import { ProjectIdSchema } from "../projects/project.schema";
import { LevelMappingSchema } from "./level-mapping.schema";
import {
  CreateRoadmapItemSchema,
  RoadmapConfigSchema,
  RoadmapItemIdSchema,
  RoadmapItemSchema,
  UpdateRoadmapItemSchema,
} from "./roadmap-item.schema";
import { OverrideRoadmapItemSchema, PlayRoadmapItemsSchema } from "./roadmap-play.schema";
import { RoadmapSyncResultSchema } from "./roadmap-sync.schema";

const c = initContract();

/**
 * The per-project roadmap: item CRUD + the auto-sync config toggle (125a),
 * the manual Jira/GitHub sync route (125b), the play/gate actions (125e),
 * plus the global level-mapping table (`/settings?tab=tasks`, not
 * project-scoped — it applies across every project's sync). Each sub-phase's
 * routes landed on this same router in their own diff (see DECISIONS.md D-005).
 *
 * Route ordering: `/projects/:projectId/roadmap/items` (static) is declared
 * before `/projects/:projectId/roadmap/items/:itemId` (param) for the same
 * reason `agentsContract` orders `/agents/search` before `/agents/:id` — a
 * literal segment must never be shadowed by an adjacent `:param` route.
 * `/roadmap/sync`, `/roadmap/config` and `/roadmap/level-mapping` each sit in
 * their own static segment so none can collide with `:itemId` either.
 *
 * 125e adds the play/override/restart/resume actions, all suffixed onto
 * `/items/:itemId` (a different segment COUNT than `/items/:itemId` itself,
 * so no ordering hazard with the CRUD routes above) plus the project-level
 * bulk `/roadmap/play`.
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

    // 125e — play records intent only (`lifecycle: "enqueued"`); the gate then
    // attempts an immediate drain. 409 when the item isn't `todo` ("already in
    // flight" — covers every other lifecycle, including a re-play of an
    // already-enqueued/running/done item).
    playRoadmapItem: {
      method: "POST",
      path: "/projects/:projectId/roadmap/items/:itemId/play",
      pathParams: z.object({ projectId: ProjectIdSchema, itemId: RoadmapItemIdSchema }),
      body: EmptyBodySchema,
      responses: {
        200: RoadmapItemSchema,
        404: ErrorSchema,
        409: ErrorSchema,
      },
      summary:
        "Play a roadmap item — enqueue it; the gate releases it once its dependencies are done",
    },

    // 125e — Tier-3 "pustit i tak". Always 200s: the flag can be set on any
    // lifecycle (it only takes effect the next time the gate evaluates the
    // item), and setting it to `true` on an already-`enqueued` item triggers
    // an immediate drain attempt.
    overrideRoadmapItem: {
      method: "POST",
      path: "/projects/:projectId/roadmap/items/:itemId/override",
      pathParams: z.object({ projectId: ProjectIdSchema, itemId: RoadmapItemIdSchema }),
      body: OverrideRoadmapItemSchema,
      responses: {
        200: RoadmapItemSchema,
        404: ErrorSchema,
      },
      summary: 'Tier-3 "pustit i tak" — dispatch even while a dependency is not done',
    },

    // 125e — a `failed` item's two recovery actions (see roadmap.md's
    // "Restart vs Resume" for the shape decision). Both 409 outside `failed`;
    // resume additionally 409s when the last run never reached a resumable
    // agent run (nothing to resume — restart is the only option then).
    restartRoadmapItem: {
      method: "POST",
      path: "/projects/:projectId/roadmap/items/:itemId/restart",
      pathParams: z.object({ projectId: ProjectIdSchema, itemId: RoadmapItemIdSchema }),
      body: EmptyBodySchema,
      responses: {
        200: RoadmapItemSchema,
        404: ErrorSchema,
        409: ErrorSchema,
      },
      summary: "Restart a failed item with a brand-new task",
    },

    resumeRoadmapItem: {
      method: "POST",
      path: "/projects/:projectId/roadmap/items/:itemId/resume",
      pathParams: z.object({ projectId: ProjectIdSchema, itemId: RoadmapItemIdSchema }),
      body: EmptyBodySchema,
      responses: {
        200: RoadmapItemSchema,
        404: ErrorSchema,
        409: ErrorSchema,
      },
      summary: "Resume a failed item's last run in place (reuses the existing resume machinery)",
    },

    // 125e — bulk play ("zařadit vše"). Never 409s: an id that isn't `todo` is
    // silently skipped (a multi-select naturally mixes lifecycles once some
    // cards are already in flight) rather than failing the whole batch; only
    // the items actually moved to `enqueued` come back in the response.
    playRoadmapItems: {
      method: "POST",
      path: "/projects/:projectId/roadmap/play",
      pathParams: z.object({ projectId: ProjectIdSchema }),
      body: PlayRoadmapItemsSchema,
      responses: {
        200: z.array(RoadmapItemSchema),
        404: ErrorSchema,
      },
      summary: 'Bulk play ("zařadit vše") — enqueue several items at once, FIFO by array order',
    },

    // 125b: pulls the project's resolved Jira/GitHub integrations and upserts
    // their issues as roadmap items (see `RoadmapSourceService`). A project
    // with no Jira/GitHub integration configured is NOT an error — the
    // handler returns an all-zero `RoadmapSyncResultSchema`, mirroring
    // `ProjectPrService.listOpen`'s "no link is not an error" posture. 404
    // only for a project id that doesn't resolve to a real project at all.
    syncRoadmapItems: {
      method: "POST",
      path: "/projects/:projectId/roadmap/sync",
      pathParams: z.object({ projectId: ProjectIdSchema }),
      body: EmptyBodySchema,
      responses: {
        200: RoadmapSyncResultSchema,
        404: ErrorSchema,
      },
      summary: "Pull the project's Jira/GitHub roadmap items and upsert them",
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
