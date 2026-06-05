import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { projectsContract } from "@zibby/contracts"
import { ProjectConflictError, ProjectNotFoundError } from "./projects.errors"
import { ProjectsStorageService } from "./projects.storage.service"

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
      createProject: async ({ body }) => {
        try {
          const project = await this.storage.create(body)
          return { status: 201, body: project }
        } catch (error) {
          if (error instanceof ProjectConflictError) {
            return { status: 409, body: { message: error.message } }
          }
          throw error
        }
      },

      listProjects: async () => ({ status: 200, body: await this.storage.list() }),

      getProject: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.storage.get(id) }
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404, body: { message: error.message } }
          }
          throw error
        }
      },

      updateProject: async ({ params: { id }, body }) => {
        try {
          return { status: 200, body: await this.storage.update(id, body) }
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404, body: { message: error.message } }
          }
          throw error
        }
      },

      deleteProject: async ({ params: { id } }) => {
        try {
          await this.storage.delete(id)
          return { status: 200, body: { id } }
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return { status: 404, body: { message: error.message } }
          }
          throw error
        }
      },
    })
  }
}
