import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { projectsContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
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
  constructor(private readonly storage: ProjectsStorageService) {}

  @TsRestHandler(projectsContract)
  handler() {
    return tsRestHandler(projectsContract, {
      createProject: ({ body }) => errors.created(() => this.storage.create(body)),

      listProjects: async () => ({ status: 200, body: await this.storage.list() }),

      searchProjects: async ({ query: { q } }) => ({
        status: 200,
        body: await this.storage.search(q),
      }),

      getProject: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateProject: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body)),

      deleteProject: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id)
          return { id }
        }),
    })
  }
}
