import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { projectCategoriesContract } from "@zibby/contracts";
import { makeCategoryHandlers } from "../shared/categories/category-handlers";
import { ProjectCategoriesStorageService } from "./project-categories.storage.service";
import { ProjectsStorageService } from "./projects.storage.service";

/**
 * Implements `projectCategoriesContract` (`/api/projects/categories`). Mounted
 * before {@link ProjectsController} so the static categories routes register
 * ahead of `GET /api/projects/:id`. A category is deletable only while no project
 * still references it (409 otherwise).
 */
@Controller()
export class ProjectCategoriesController {
  constructor(
    private readonly categories: ProjectCategoriesStorageService,
    private readonly projects: ProjectsStorageService,
  ) {}

  @TsRestHandler(projectCategoriesContract)
  handler() {
    return tsRestHandler(
      projectCategoriesContract,
      makeCategoryHandlers({
        store: this.categories,
        countInCategory: async (name) =>
          (await this.projects.list()).filter((p) => p.category === name).length,
        noun: "project",
      }),
    );
  }
}
