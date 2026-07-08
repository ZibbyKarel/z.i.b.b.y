import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import type { Project, ProjectProfile, ResolvedProjectContext } from "@zibby/contracts";
import { projectsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { ProjectLocalService } from "./project-local.service";
import { ProjectPrService } from "./project-pr.service";
import { ProjectSecretsStore } from "./project-secrets.store";
import { ProjectVaultService } from "./project-vault.service";
import {
  NoGithubLinkError,
  PrNotMergeableError,
  ProjectAlreadyClonedError,
  ProjectConflictError,
  ProjectNoRemoteError,
  ProjectNotFoundError,
} from "./projects.errors";
import { ProjectsStorageService } from "./projects.storage.service";
import { ResolvedProjectService } from "./resolved-project.service";
import { StandupService } from "./standup.service";

const errors = makeErrorMapper("Project", {
  missing: [ProjectNotFoundError],
  conflict: [ProjectConflictError],
});

/** Extract the profile fields from a full project entity. */
function toProfile(project: Project): ProjectProfile {
  return {
    ...(project.identity ? { identity: project.identity } : {}),
    ...(project.autonomy_policy ? { autonomy_policy: project.autonomy_policy } : {}),
    ...(project.daily_rhythm ? { daily_rhythm: project.daily_rhythm } : {}),
  };
}

/**
 * Implements `projectsContract` against the JSON-manifest-backed storage service.
 * Request bodies, query and path params are validated against the contract's Zod
 * schemas by `@ts-rest/nest` before a handler runs (invalid input → 400).
 *
 * Mounted *after* {@link import("./project-categories.controller").ProjectCategoriesController}
 * (see `ProjectsModule`) so `GET /api/projects/categories` is matched before this
 * resource's `GET /api/projects/:id`, which would otherwise treat "categories" as
 * a project id.
 */
@Controller()
export class ProjectsController {
  constructor(
    private readonly storage: ProjectsStorageService,
    private readonly secrets: ProjectSecretsStore,
    private readonly standup: StandupService,
    private readonly vault: ProjectVaultService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly local: ProjectLocalService,
    private readonly projectPrs: ProjectPrService,
  ) {}

  /** Layer the read-time `hasSecrets` onto an entity for the wire. */
  private async withSecretState(project: Project): Promise<Project> {
    return { ...project, hasSecrets: await this.secrets.has(project.id) };
  }

  /**
   * The project's EFFECTIVE (company-merged) context (Phase 72): the merged
   * people/budget/integrations from {@link ResolvedProjectService.resolve} plus
   * the linked company's `id`/`name` (a separate, additive lookup — `resolve`'s
   * own return shape is unchanged from Phase 70) for the UI's "from company X"
   * note. Absent companyId/companyName means the project has no company, or its
   * `companyId` is dangling — either way every facet above already equals its
   * own raw data.
   */
  private async resolveContext(project: Project): Promise<ResolvedProjectContext> {
    const [context, companyRef] = await Promise.all([
      this.resolvedProjects.resolve(project),
      this.resolvedProjects.resolveCompanyRef(project),
    ]);
    return { ...context, companyId: companyRef?.id, companyName: companyRef?.name };
  }

  @TsRestHandler(projectsContract)
  handler() {
    return tsRestHandler(projectsContract, {
      createProject: ({ body }) =>
        errors.created(async () => {
          const project = await this.storage.create(body);
          void this.vault.write(project);
          return this.withSecretState(project);
        }),

      listProjects: async () => {
        const all = await this.storage.list();
        return { status: 200, body: await Promise.all(all.map((p) => this.withSecretState(p))) };
      },

      searchProjects: async ({ query: { q } }) => {
        const hits = await this.storage.search(q);
        return { status: 200, body: await Promise.all(hits.map((p) => this.withSecretState(p))) };
      },

      getProject: ({ params: { id } }) =>
        errors.or404(id, async () => this.withSecretState(await this.storage.get(id))),

      updateProject: ({ params: { id }, body }) =>
        errors.or404(id, async () => {
          const updated = await this.storage.update(id, body);
          void this.vault.write(updated);
          return this.withSecretState(updated);
        }),

      deleteProject: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.get(id); // 404 before any side effect
          await this.storage.delete(id);
          await this.secrets.remove(id);
          void this.vault.remove(id);
          return { id };
        }),

      setProjectSecrets: ({ params: { id }, body }) =>
        errors.or404(id, async () => {
          const existing = await this.storage.get(id);
          await this.secrets.write(id, body);
          return this.withSecretState(existing);
        }),

      deleteProjectSecrets: ({ params: { id } }) =>
        errors.or404(id, async () => {
          const existing = await this.storage.get(id);
          await this.secrets.remove(id);
          return this.withSecretState(existing);
        }),

      getProjectProfile: ({ params: { id } }) =>
        errors.or404(id, async () => toProfile(await this.storage.get(id))),

      updateProjectProfile: ({ params: { id }, body }) =>
        errors.or404(id, async () => {
          const updated = await this.storage.update(id, body);
          void this.vault.write(updated);
          return toProfile(updated);
        }),

      getStandup: async ({ params: { id } }) => {
        const result = await this.standup.get(id).catch(() => null);
        if (!result)
          return { status: 404 as const, body: { message: `No standup for project "${id}"` } };
        return { status: 200 as const, body: result };
      },

      getResolvedProject: ({ params: { id } }) =>
        errors.or404(id, async () => this.resolveContext(await this.storage.get(id))),

      getProjectLocalState: ({ params: { id } }) =>
        errors.or404(id, async () => this.local.resolve(await this.storage.get(id))),

      cloneProject: async ({ params: { id } }) => {
        let project: Project;
        try {
          project = await this.storage.get(id);
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404 as const, body: { message: error.message } };
          }
          throw error;
        }
        try {
          return { status: 200 as const, body: await this.local.clone(project) };
        } catch (error) {
          if (error instanceof ProjectNoRemoteError) {
            return { status: 422 as const, body: { message: error.message } };
          }
          if (error instanceof ProjectAlreadyClonedError) {
            return { status: 409 as const, body: { message: error.message } };
          }
          throw error;
        }
      },

      // Phase 78 — open-PR overview + explicit operator merge. `[]` (never an
      // error) when the project has no github link; `getProjectPrs` only 404s
      // for an unknown project id.
      getProjectPrs: ({ params: { id } }) =>
        errors.or404(id, () => this.projectPrs.listOpen(id)),

      mergeProjectPr: async ({ params: { id, number }, body }) => {
        try {
          return {
            status: 200 as const,
            body: await this.projectPrs.merge(id, number, body?.method),
          };
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404 as const, body: { message: error.message } };
          }
          if (error instanceof NoGithubLinkError) {
            return { status: 422 as const, body: { message: error.message } };
          }
          if (error instanceof PrNotMergeableError) {
            return { status: 409 as const, body: { message: error.message } };
          }
          throw error;
        }
      },
    });
  }
}
