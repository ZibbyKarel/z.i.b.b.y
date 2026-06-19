import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { SkillCategoriesController } from "./skill-categories.controller";
import { SkillCategoriesStorageService } from "./skill-categories.storage.service";
import { SkillsController } from "./skills.controller";
import { SKILLS_DIR, SkillsStorageService } from "./skills.storage.service";

/** Default skills dir, anchored to `apps/api/data/skills` the same way agents are. */
export function resolveSkillsDir(): string {
  return process.env.SKILLS_DIR ?? dataDir("skills");
}

// Skills are catalog-only: a skill is a capability an agent invokes, not an
// autonomous runner, so there's no SkillRunsController / SkillRunnerService here.
@Module({
  // SkillCategoriesController is declared before SkillsController so its static
  // route (`GET /skills/categories`) registers ahead of `/skills/:id`, which would
  // otherwise capture "categories" as a skill id.
  controllers: [SkillCategoriesController, SkillsController],
  providers: [
    { provide: SKILLS_DIR, useFactory: resolveSkillsDir },
    SkillsStorageService,
    SkillCategoriesStorageService,
  ],
  exports: [SkillsStorageService, SkillCategoriesStorageService],
})
export class SkillsModule {}
