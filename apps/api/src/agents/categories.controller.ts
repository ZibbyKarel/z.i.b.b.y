import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { categoriesContract } from "@zibby/contracts"
import { makeCategoryHandlers } from "../shared/categories/category-handlers"
import { AgentsStorageService } from "./agents.storage.service"
import { CategoriesStorageService } from "./categories.storage.service"

/**
 * Implements `categoriesContract` (`/api/agents/categories`). Mounted *before*
 * {@link import("./agents.controller").AgentsController} (see `AgentsModule`) so
 * the static categories routes register ahead of the agents resource's
 * `GET /api/agents/:id` route, which would otherwise treat "categories" as an
 * agent id. The e2e suite guards this ordering. A category is deletable only
 * while no agent still references it (409 otherwise).
 */
@Controller()
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesStorageService,
    private readonly agents: AgentsStorageService,
  ) {}

  @TsRestHandler(categoriesContract)
  handler() {
    return tsRestHandler(
      categoriesContract,
      makeCategoryHandlers({
        store: this.categories,
        countInCategory: async (name) =>
          (await this.agents.list()).filter((a) => a.category === name).length,
        noun: "agent",
      }),
    )
  }
}
