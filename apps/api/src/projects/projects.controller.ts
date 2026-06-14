import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import type { Project } from "@zibby/contracts"
import { projectsContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
import { ProjectSecretsStore } from "./project-secrets.store"
import { ProjectConflictError, ProjectNotFoundError } from "./projects.errors"
import { ProjectsStorageService } from "./projects.storage.service"

const errors = makeErrorMapper("Project", {
  missing: [ProjectNotFoundError],
  conflict: [ProjectConflictError],
})

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
  ) {}

  /** Layer the read-time `hasSecrets` onto an entity for the wire. */
  private async withSecretState(project: Project): Promise<Project> {
    return { ...project, hasSecrets: await this.secrets.has(project.id) }
  }

  @TsRestHandler(projectsContract)
  handler() {
    return tsRestHandler(projectsContract, {
      createProject: ({ body }) =>
        errors.created(async () => this.withSecretState(await this.storage.create(body))),

      listProjects: async () => {
        const all = await this.storage.list()
        return { status: 200, body: await Promise.all(all.map((p) => this.withSecretState(p))) }
      },

      searchProjects: async ({ query: { q } }) => {
        const hits = await this.storage.search(q)
        return { status: 200, body: await Promise.all(hits.map((p) => this.withSecretState(p))) }
      },

      getProject: ({ params: { id } }) =>
        errors.or404(id, async () => this.withSecretState(await this.storage.get(id))),

      updateProject: ({ params: { id }, body }) =>
        errors.or404(id, async () => this.withSecretState(await this.storage.update(id, body))),

      deleteProject: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.get(id) // 404 before any side effect
          await this.storage.delete(id)
          await this.secrets.remove(id)
          return { id }
        }),

      setProjectSecrets: ({ params: { id }, body }) =>
        errors.or404(id, async () => {
          const existing = await this.storage.get(id)
          await this.secrets.write(id, body)
          return this.withSecretState(existing)
        }),

      deleteProjectSecrets: ({ params: { id } }) =>
        errors.or404(id, async () => {
          const existing = await this.storage.get(id)
          await this.secrets.remove(id)
          return this.withSecretState(existing)
        }),
    })
  }
}
