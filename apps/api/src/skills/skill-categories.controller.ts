import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { skillCategoriesContract } from "@zibby/contracts";
import { makeCategoryHandlers } from "../shared/categories/category-handlers";
import { SkillCategoriesStorageService } from "./skill-categories.storage.service";
import { SkillsStorageService } from "./skills.storage.service";

/**
 * Implements `skillCategoriesContract` (`/api/skills/categories`). Mounted before
 * {@link SkillsController} so the static categories routes register ahead of
 * `GET /api/skills/:id`. A category is deletable only while no skill still
 * references it (409 otherwise).
 */
@Controller()
export class SkillCategoriesController {
  constructor(
    private readonly categories: SkillCategoriesStorageService,
    private readonly skills: SkillsStorageService,
  ) {}

  @TsRestHandler(skillCategoriesContract)
  handler() {
    return tsRestHandler(
      skillCategoriesContract,
      makeCategoryHandlers({
        store: this.categories,
        countInCategory: async (name) =>
          (await this.skills.list()).filter((s) => s.category === name).length,
        noun: "skill",
      }),
    );
  }
}
