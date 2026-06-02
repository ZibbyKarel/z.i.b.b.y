import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { categoriesContract } from "@zibby/contracts"
import { AgentsStorageService } from "./agents.storage.service"
import { CategoryConflictError, CategoryNotFoundError } from "./categories.errors"
import { CategoriesStorageService } from "./categories.storage.service"

/**
 * Implements `categoriesContract` against the manifest-backed storage service.
 *
 * Mounted *before* {@link import("./agents.controller").AgentsController} (see
 * `AgentsModule`) so `GET /api/agents/categories` is matched before the agents
 * resource's `GET /api/agents/:id` route, which would otherwise treat
 * "categories" as an agent id. The e2e suite guards this ordering.
 */
@Controller()
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesStorageService,
    private readonly agents: AgentsStorageService,
  ) {}

  @TsRestHandler(categoriesContract)
  handler() {
    return tsRestHandler(categoriesContract, {
      listCategories: async () => ({ status: 200, body: await this.categories.list() }),

      createCategory: async ({ body }) => {
        try {
          const category = await this.categories.create(body)
          return { status: 201, body: category }
        } catch (error) {
          if (error instanceof CategoryConflictError) {
            return { status: 409, body: { message: error.message } }
          }
          throw error
        }
      },

      deleteCategory: async ({ params: { name } }) => {
        // A category is deletable only while empty: removing one that agents
        // still reference would orphan them from the catalog's grouping.
        const inUse = (await this.agents.list()).filter((a) => a.category === name).length
        if (inUse > 0) {
          return {
            status: 409,
            body: { message: `Category "${name}" still has ${inUse} agent(s) and cannot be deleted` },
          }
        }
        try {
          await this.categories.delete(name)
          return { status: 200, body: { name } }
        } catch (error) {
          if (error instanceof CategoryNotFoundError) {
            return { status: 404, body: { message: error.message } }
          }
          throw error
        }
      },
    })
  }
}
