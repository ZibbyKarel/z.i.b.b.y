import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import {
  type RoadmapConfig,
  type RoadmapConfigResponse,
  type RoadmapItem,
  RoadmapItemSchema,
  resolveRoadmapConfig,
  roadmapContract,
} from "@zibby/contracts";
import { ProjectNotFoundError } from "../projects/projects.errors";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { collisionResistantId } from "../shared/file-storage";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { RoadmapGateService } from "./roadmap-gate.service";
import {
  InvalidRoadmapItemIdError,
  InvalidRoadmapProjectIdError,
  RoadmapItemConflictError,
  RoadmapItemLifecycleError,
  RoadmapItemNotFoundError,
} from "./roadmap.errors";
import { RoadmapStore } from "./roadmap.store";

// CorruptRoadmapItemFileError is deliberately NOT in `missing` — see its
// docblock. Folding it into the same 404 as "not found" would silently hide
// real data loss behind an everyday, expected status; left unmapped it
// surfaces as an unhandled exception (a 500), a loud signal something on
// disk is actually broken.
const errors = makeErrorMapper("RoadmapItem", {
  missing: [RoadmapItemNotFoundError, InvalidRoadmapItemIdError, InvalidRoadmapProjectIdError],
  conflict: [RoadmapItemConflictError],
});

const projectErrors = makeErrorMapper("Project", { missing: [ProjectNotFoundError] });

const unprocessable = (message: string) => ({ status: 422 as const, body: { message } });
const conflict = (message: string) => ({ status: 409 as const, body: { message } });

// 125e — play/restart/resume reach `RoadmapGateService`, which can throw either a
// missing-project error (an item's project record was deleted after the item was
// created) or a lifecycle-state conflict. Both need mapping alongside the ordinary
// RoadmapItem 404s already in `errors` above, so each of those three routes passes
// this as its `or404` `extra`.
function gateExtra(projectId: string) {
  return (error: unknown) => {
    if (error instanceof ProjectNotFoundError) return projectErrors.notFound(projectId);
    if (error instanceof RoadmapItemLifecycleError) return conflict(error.message);
    return undefined;
  };
}

// `overrideRoadmapItem` never throws `RoadmapItemLifecycleError` (it accepts any
// lifecycle — see `RoadmapGateService.override`'s docblock) and its contract
// response union has no 409, so its `extra` maps only the project-missing case.
function overrideExtra(projectId: string) {
  return (error: unknown) =>
    error instanceof ProjectNotFoundError ? projectErrors.notFound(projectId) : undefined;
}

/**
 * Implements `roadmapContract` against the file-backed stores. Request bodies,
 * path params and query are validated against the contract's Zod schemas by
 * `@ts-rest/nest` before a handler runs (invalid input -> 400).
 */
@Controller()
export class RoadmapController {
  constructor(
    private readonly roadmap: RoadmapStore,
    private readonly roadmapGate: RoadmapGateService,
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
  ) {}

  /**
   * The stored tri-state config plus the resolved `effective` view (project →
   * company default → global). A dangling project id resolves with no company.
   */
  private async withEffective(
    projectId: string,
    config: RoadmapConfig,
  ): Promise<RoadmapConfigResponse> {
    const project = await this.projects.get(projectId).catch(() => null);
    const company = project ? await this.resolvedProjects.resolveCompany(project) : undefined;
    return { ...config, effective: resolveRoadmapConfig(config, company?.roadmapDefaults) };
  }

  @TsRestHandler(roadmapContract)
  handler() {
    return tsRestHandler(roadmapContract, {
      listRoadmapItems: async ({ params: { projectId } }) => ({
        status: 200,
        body: await this.roadmap.list(projectId),
      }),

      createRoadmapItem: async ({ params: { projectId }, body }) => {
        // A manually created task/epic may declare a parent epic; it must
        // already exist in this project and must itself be an epic (a task
        // parented to a task would break the epic-list/task-board split).
        if (body.parentId) {
          let parent: RoadmapItem;
          try {
            parent = await this.roadmap.get(projectId, body.parentId);
          } catch {
            return unprocessable(
              `parentId "${body.parentId}" does not reference an existing roadmap item in this project`,
            );
          }
          if (parent.level !== "epic") {
            return unprocessable(`parentId "${body.parentId}" must reference an epic`);
          }
        }

        const now = new Date().toISOString();
        const item: RoadmapItem = {
          id: collisionResistantId("roadmap"),
          projectId,
          level: body.level,
          parentId: body.parentId,
          name: body.name,
          description: body.description ?? "",
          source: { kind: "manual" },
          attachments: [],
          dependsOn: body.dependsOn ?? [],
          dependsOnFromSource: [],
          overrideBlocked: body.overrideBlocked,
          lifecycle: "todo",
          runs: [],
          syncNotes: [],
          createdAt: now,
          updatedAt: now,
        };
        return errors.created(() => this.roadmap.put(item));
      },

      getRoadmapItem: ({ params: { projectId, itemId } }) =>
        errors.or404(itemId, () => this.roadmap.get(projectId, itemId)),

      updateRoadmapItem: ({ params: { projectId, itemId }, body }) =>
        errors.or404(itemId, () =>
          this.roadmap.update(projectId, itemId, (current) => {
            const merged: Record<string, unknown> = {
              ...current,
              ...body,
              id: current.id,
              projectId: current.projectId,
            };
            // `parentId: null` is the explicit "clear" signal (undefined can't
            // survive JSON transport) — same convention as `UpdateAgentSchema.avatar`.
            if (body.parentId === null) delete merged.parentId;
            // Any operator edit clears the "navrhla ZIBBY" badge (125g), whether
            // or not this item actually carries an origin today.
            delete merged.origin;
            merged.updatedAt = new Date().toISOString();
            return RoadmapItemSchema.parse(merged);
          }),
        ),

      deleteRoadmapItem: ({ params: { projectId, itemId } }) =>
        errors.or404(itemId, async () => {
          await this.roadmap.delete(projectId, itemId);
          return { id: itemId };
        }),

      playRoadmapItem: ({ params: { projectId, itemId } }) =>
        errors.or404(itemId, () => this.roadmapGate.play(projectId, itemId), gateExtra(projectId)),

      overrideRoadmapItem: ({ params: { projectId, itemId }, body }) =>
        errors.or404(
          itemId,
          () => this.roadmapGate.override(projectId, itemId, body.overrideBlocked),
          overrideExtra(projectId),
        ),

      restartRoadmapItem: ({ params: { projectId, itemId } }) =>
        errors.or404(
          itemId,
          () => this.roadmapGate.restart(projectId, itemId),
          gateExtra(projectId),
        ),

      resumeRoadmapItem: ({ params: { projectId, itemId } }) =>
        errors.or404(
          itemId,
          () => this.roadmapGate.resume(projectId, itemId),
          gateExtra(projectId),
        ),

      playRoadmapItems: async ({ params: { projectId }, body }) => ({
        status: 200,
        body: await this.roadmapGate.playBulk(projectId, body.itemIds),
      }),

      getRoadmapConfig: async ({ params: { projectId } }) => ({
        status: 200,
        body: await this.withEffective(projectId, await this.roadmap.readConfig(projectId)),
      }),

      putRoadmapConfig: async ({ params: { projectId }, body }) => ({
        status: 200,
        // Patch, not replace — see the route's own comment in the contract.
        body: await this.withEffective(projectId, await this.roadmap.updateConfig(projectId, body)),
      }),
    });
  }
}
