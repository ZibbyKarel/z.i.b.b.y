import { Module } from "@nestjs/common"
import { ApprovalsModule } from "../approvals/approvals.module"
import { dataDir } from "../shared/data-dir"
import { SkillCategoriesController } from "./skill-categories.controller"
import { SkillCategoriesStorageService } from "./skill-categories.storage.service"
import { SKILL_RUNS_DIR, SkillRunnerService } from "./skill-runner.service"
import { SkillRunsController } from "./skill-runs.controller"
import { SkillsController } from "./skills.controller"
import { SKILLS_DIR, SkillsStorageService } from "./skills.storage.service"

/** Default skills dir, anchored to `apps/api/data/skills` the same way agents are. */
export function resolveSkillsDir(): string {
  return process.env.SKILLS_DIR ?? dataDir("skills")
}

/** Default directory for skill run artifacts (logs + per-run sandboxes). */
export function resolveSkillRunsDir(): string {
  return process.env.SKILL_RUNS_DIR ?? dataDir("skills", "runs")
}

@Module({
  imports: [ApprovalsModule],
  // SkillCategoriesController and SkillRunsController are declared before
  // SkillsController so their static routes (`GET /skills/categories`,
  // `GET /skills/running`, `/skills/runs/:runId`) register ahead of `/skills/:id`,
  // which would otherwise capture "categories"/"running"/"runs" as a skill id.
  controllers: [SkillCategoriesController, SkillRunsController, SkillsController],
  providers: [
    { provide: SKILLS_DIR, useFactory: resolveSkillsDir },
    { provide: SKILL_RUNS_DIR, useFactory: resolveSkillRunsDir },
    SkillsStorageService,
    SkillCategoriesStorageService,
    SkillRunnerService,
  ],
  exports: [SkillsStorageService, SkillCategoriesStorageService, SkillRunnerService],
})
export class SkillsModule {}
